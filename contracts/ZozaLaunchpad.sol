// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

// Zoza launchpad for Elysium (HYPE gas).
//
// ZozaLaunchFactory.launchToken mints a fixed supply of a new ZozaToken
// straight into its own ZozaCurve: a constant-product bonding curve with a
// virtual HYPE reserve, so the very first buy already has a price. Every buy
// and sell settles against the curve in native HYPE. There is no migration to
// a DEX: a token trades on its curve for as long as anyone wants to.
//
// Fees per trade (taken from the HYPE side):
//   - base fee (feeBps): split between the protocol (protocolFeeShareBps) and
//     the creator;
//   - creator tax (creatorTaxBps, chosen at launch, capped by the factory):
//     goes to the creator in full.
// Fees are booked on the curve and moved into the shared ZozaFeeEscrow with
// sweepFees(); each recipient then withdraws with claim().
//
// The external interface deliberately matches the launchpad the Zoza
// frontend was first written against, so the same reads and calls work.

/// @notice Minimal ERC-20 with on-chain launch metadata.
contract ZozaToken {
    struct Socials {
        string twitter;
        string telegram;
        string discord;
        string website;
        string farcaster;
    }

    string public name;
    string public symbol;
    uint8 public constant decimals = 18;
    uint256 public totalSupply;
    address public immutable curve;

    address private immutable _deployer;
    string private _logo;
    string private _description;
    Socials private _socials;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor(
        string memory name_,
        string memory symbol_,
        string memory logo_,
        string memory description_,
        Socials memory socials_,
        address deployer_,
        address curve_,
        uint256 supply
    ) {
        name = name_;
        symbol = symbol_;
        _logo = logo_;
        _description = description_;
        _socials = socials_;
        _deployer = deployer_;
        curve = curve_;
        totalSupply = supply;
        balanceOf[curve_] = supply;
        emit Transfer(address(0), curve_, supply);
    }

    function getTokenInfo()
        external
        view
        returns (address tokenDeployer, string memory tokenLogo, string memory tokenDescription, Socials memory tokenSocials)
    {
        return (_deployer, _logo, _description, _socials);
    }

    function approve(address spender, uint256 value) external returns (bool) {
        allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }

    function transfer(address to, uint256 value) external returns (bool) {
        _transfer(msg.sender, to, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) {
            require(allowed >= value, "allowance");
            allowance[from][msg.sender] = allowed - value;
        }
        _transfer(from, to, value);
        return true;
    }

    /// @notice Burns the caller's tokens (lowers totalSupply).
    function burn(uint256 value) external {
        require(balanceOf[msg.sender] >= value, "balance");
        balanceOf[msg.sender] -= value;
        totalSupply -= value;
        emit Transfer(msg.sender, address(0), value);
    }

    function _transfer(address from, address to, uint256 value) private {
        require(balanceOf[from] >= value, "balance");
        balanceOf[from] -= value;
        if (to == address(0)) {
            totalSupply -= value;
        } else {
            balanceOf[to] += value;
        }
        emit Transfer(from, to, value);
    }
}

/// @notice Holds swept fees until each recipient claims them.
contract ZozaFeeEscrow {
    mapping(address => uint256) public balanceOf;
    bool private _locked;

    event Credited(address indexed recipient, uint256 amount);
    event Claimed(address indexed recipient, uint256 amount);

    /// @notice Credits msg.value to `recipient`. Anyone may pay in.
    function credit(address recipient) external payable {
        balanceOf[recipient] += msg.value;
        emit Credited(recipient, msg.value);
    }

    /// @notice Sends the caller's whole balance to it.
    function claim() external returns (uint256 amount) {
        require(!_locked, "reentrant");
        _locked = true;
        amount = balanceOf[msg.sender];
        require(amount > 0, "nothing to claim");
        balanceOf[msg.sender] = 0;
        (bool ok,) = msg.sender.call{value: amount}("");
        require(ok, "transfer failed");
        emit Claimed(msg.sender, amount);
        _locked = false;
    }
}

/// @notice Constant-product bonding curve for one ZozaToken, priced in HYPE.
contract ZozaCurve {
    uint256 private constant BPS = 10_000;

    ZozaLaunchFactory public immutable factory;
    ZozaFeeEscrow public immutable escrow;
    ZozaToken public token;
    /// @notice Who receives the creator's fees.
    address public immutable deployer;
    uint256 public immutable feeBps;
    uint256 public immutable creatorTaxBps;
    uint16 public immutable protocolFeeShareBps;
    /// @notice Virtual HYPE reserve that sets the starting price.
    uint256 public immutable phantomQuote;

    /// @notice HYPE actually paid in and still backing the curve.
    uint256 public realQuoteReserve;
    /// @notice Base fees booked and not yet swept.
    uint256 public quoteFeeBalance;
    /// @notice Creator tax booked and not yet swept.
    uint256 public creatorTaxBalance;

    bool private _locked;

    event CurveBuy(address indexed buyer, address indexed recipient, uint256 quoteIn, uint256 tokensOut, uint256 fee, uint256 tax);
    event CurveSell(address indexed seller, address indexed recipient, uint256 tokensIn, uint256 quoteOut, uint256 fee, uint256 tax);
    event FeesSwept(uint256 toCreator, uint256 toProtocol);

    modifier nonReentrant() {
        require(!_locked, "reentrant");
        _locked = true;
        _;
        _locked = false;
    }

    constructor(
        ZozaFeeEscrow escrow_,
        address deployer_,
        uint256 feeBps_,
        uint256 creatorTaxBps_,
        uint16 protocolFeeShareBps_,
        uint256 phantomQuote_
    ) {
        factory = ZozaLaunchFactory(msg.sender);
        escrow = escrow_;
        deployer = deployer_;
        feeBps = feeBps_;
        creatorTaxBps = creatorTaxBps_;
        protocolFeeShareBps = protocolFeeShareBps_;
        phantomQuote = phantomQuote_;
    }

    /// @notice Set once by the factory, right after the token is created.
    function initialize(ZozaToken token_) external {
        require(msg.sender == address(factory) && address(token) == address(0), "init");
        token = token_;
    }

    // ---- views kept for interface compatibility ----

    function getReserves() public view returns (uint256 quoteReserve_, uint256 tokenReserve_) {
        return (phantomQuote + realQuoteReserve, token.balanceOf(address(this)));
    }

    /// @notice 0: this curve never migrates.
    function graduationThreshold() external pure returns (uint256) {
        return 0;
    }

    function graduated() external pure returns (bool) {
        return false;
    }

    function sellableTokens() public view returns (uint256) {
        return token.balanceOf(address(this));
    }

    function buybackQuoteBalance() external pure returns (uint256) {
        return 0;
    }

    // ---- trading ----

    function buy(uint256 quoteIn, uint256 minTokensOut, address recipient)
        external
        payable
        nonReentrant
        returns (uint256 tokensOut)
    {
        require(msg.value == quoteIn && quoteIn > 0, "value");
        require(recipient != address(0), "recipient");
        uint256 net = (quoteIn * (BPS - feeBps - creatorTaxBps)) / BPS;
        uint256 fee = (quoteIn * feeBps) / BPS;
        uint256 tax = quoteIn - net - fee;
        (uint256 q, uint256 t) = getReserves();
        tokensOut = (net * t) / (q + net);
        require(tokensOut > 0 && tokensOut >= minTokensOut, "slippage");
        realQuoteReserve += net;
        quoteFeeBalance += fee;
        creatorTaxBalance += tax;
        require(token.transfer(recipient, tokensOut), "transfer");
        emit CurveBuy(msg.sender, recipient, quoteIn, tokensOut, fee, tax);
    }

    function sell(uint256 tokensIn, uint256 minQuoteOut, address recipient)
        external
        nonReentrant
        returns (uint256 quoteOut)
    {
        require(tokensIn > 0, "amount");
        require(recipient != address(0), "recipient");
        (uint256 q, uint256 t) = getReserves();
        uint256 gross = (tokensIn * q) / (t + tokensIn);
        require(gross <= realQuoteReserve, "reserve");
        quoteOut = (gross * (BPS - feeBps - creatorTaxBps)) / BPS;
        uint256 fee = (gross * feeBps) / BPS;
        uint256 tax = gross - quoteOut - fee;
        require(quoteOut > 0 && quoteOut >= minQuoteOut, "slippage");
        require(token.transferFrom(msg.sender, address(this), tokensIn), "transfer");
        realQuoteReserve -= gross;
        quoteFeeBalance += fee;
        creatorTaxBalance += tax;
        (bool ok,) = recipient.call{value: quoteOut}("");
        require(ok, "send");
        emit CurveSell(msg.sender, recipient, tokensIn, quoteOut, fee, tax);
    }

    /// @notice Moves booked fees into the escrow: the creator's tax plus their
    /// share of the base fee to the creator, the rest to the protocol.
    /// Anyone may call it; the money only ever goes to the two recipients.
    function sweepFees(uint256) external nonReentrant {
        uint256 fee = quoteFeeBalance;
        uint256 tax = creatorTaxBalance;
        require(fee + tax > 0, "no fees");
        quoteFeeBalance = 0;
        creatorTaxBalance = 0;
        uint256 toProtocol = (fee * protocolFeeShareBps) / BPS;
        uint256 toCreator = fee - toProtocol + tax;
        if (toCreator > 0) escrow.credit{value: toCreator}(deployer);
        if (toProtocol > 0) escrow.credit{value: toProtocol}(factory.treasury());
        emit FeesSwept(toCreator, toProtocol);
    }
}

/// @notice Launches ZozaTokens, each with its own ZozaCurve.
contract ZozaLaunchFactory {
    struct Socials {
        string twitter;
        string telegram;
        string discord;
        string website;
        string farcaster;
    }

    struct TokenParams {
        string name;
        string symbol;
        string logo;
        string description;
        Socials socials;
        address creatorFeeRecipient;
        uint16 creatorTaxBps;
        bool buybackEnabled;
        bytes32 expectedEconomics;
        bytes32 salt;
    }

    struct LaunchConfig {
        uint256 supply;
        uint256 curveFeeBps;
        uint256 phantomQuote;
        uint256 graduationThreshold;
        uint24 poolFee;
        int24 tickSpacing;
        bool enabled;
    }

    address public owner;
    address public treasury;
    ZozaFeeEscrow public immutable feeEscrow;
    uint256 public launchFee;
    uint256 public maxCreatorTaxBps;
    uint16 public protocolFeeShareBps;
    LaunchConfig[] private _configs;

    struct Launch {
        address curve;
        address deployer;
        uint64 block;
        uint64 time;
    }

    /// @notice Every token this factory launched, oldest first.
    address[] public allTokens;
    /// @notice Launch record per token (zero for tokens not launched here).
    mapping(address => Launch) public launches;
    mapping(address => address[]) private _byDeployer;

    event TokenLaunched(
        address indexed token,
        address indexed curve,
        address indexed deployer,
        address pairToken,
        uint256 launchConfigId,
        uint256 graduationThreshold
    );
    event OwnerChanged(address owner);
    event TreasuryChanged(address treasury);
    event TermsChanged(uint256 launchFee, uint256 maxCreatorTaxBps, uint16 protocolFeeShareBps);
    event ConfigSet(uint256 id, LaunchConfig config);

    modifier onlyOwner() {
        require(msg.sender == owner, "owner");
        _;
    }

    /// @param launchFee_ HYPE (wei) paid to the treasury per launch.
    /// @param phantomQuote_ virtual HYPE reserve of the default config (sets the starting market cap).
    constructor(uint256 launchFee_, uint256 phantomQuote_) {
        owner = msg.sender;
        treasury = msg.sender;
        feeEscrow = new ZozaFeeEscrow();
        launchFee = launchFee_;
        maxCreatorTaxBps = 500; // 5%
        protocolFeeShareBps = 10_000; // the 1% base fee goes to the protocol; creators earn their tax
        _configs.push(LaunchConfig(1_000_000_000 ether, 100, phantomQuote_, 0, 0, 0, true));
        emit ConfigSet(0, _configs[0]);
    }

    // ---- views ----

    function canLaunch(address) external pure returns (bool) {
        return true;
    }

    function launchConfigCount() external view returns (uint256) {
        return _configs.length;
    }

    function getLaunchConfig(uint256 id) external view returns (LaunchConfig memory) {
        return _configs[id];
    }

    /// @notice Hash of the terms a launch would get; launchToken checks it so an
    /// owner update between quote and launch cannot reprice a launch.
    function previewLaunchEconomics(uint256 id, address pairToken) public view returns (bytes32) {
        LaunchConfig memory c = _configs[id];
        return keccak256(abi.encode(pairToken, c.supply, c.curveFeeBps, c.phantomQuote, protocolFeeShareBps, launchFee));
    }

    function tokenCount() external view returns (uint256) {
        return allTokens.length;
    }

    function isZozaToken(address token) external view returns (bool) {
        return launches[token].curve != address(0);
    }

    /// @notice Block a token was launched in (0 if it was not launched here).
    function launchBlock(address token) external view returns (uint256) {
        return launches[token].block;
    }

    /// @notice Tokens launched by `deployer`, oldest first.
    function tokensBy(address deployer) external view returns (address[] memory) {
        return _byDeployer[deployer];
    }

    /// @notice Up to `count` tokens, newest first, skipping the newest `offset`.
    function recentTokens(uint256 offset, uint256 count) external view returns (address[] memory out) {
        uint256 n = allTokens.length;
        if (offset >= n) return new address[](0);
        uint256 m = n - offset < count ? n - offset : count;
        out = new address[](m);
        for (uint256 i = 0; i < m; i++) out[i] = allTokens[n - offset - 1 - i];
    }

    // ---- launching ----

    function launchToken(TokenParams calldata p, uint256 launchConfigId, address pairToken)
        external
        payable
        returns (address token, address curve)
    {
        require(pairToken == address(0), "HYPE pairs only");
        require(launchConfigId < _configs.length, "config");
        LaunchConfig memory c = _configs[launchConfigId];
        require(c.enabled, "config disabled");
        require(p.expectedEconomics == previewLaunchEconomics(launchConfigId, pairToken), "terms changed");
        require(msg.value >= launchFee, "launch fee");
        require(p.creatorTaxBps <= maxCreatorTaxBps, "tax too high");
        require(!p.buybackEnabled, "no buyback");
        require(bytes(p.name).length > 0 && bytes(p.name).length <= 64, "name");
        require(bytes(p.symbol).length > 0 && bytes(p.symbol).length <= 16, "symbol");
        require(bytes(p.logo).length <= 2048 && bytes(p.description).length <= 2048, "metadata");
        address recipient = p.creatorFeeRecipient == address(0) ? msg.sender : p.creatorFeeRecipient;

        bytes32 salt = keccak256(abi.encode(msg.sender, p.salt));
        ZozaCurve c_ = new ZozaCurve{salt: salt}(feeEscrow, recipient, c.curveFeeBps, p.creatorTaxBps, protocolFeeShareBps, c.phantomQuote);
        ZozaToken t_ = new ZozaToken{salt: salt}(
            p.name,
            p.symbol,
            p.logo,
            p.description,
            ZozaToken.Socials(p.socials.twitter, p.socials.telegram, p.socials.discord, p.socials.website, p.socials.farcaster),
            msg.sender,
            address(c_),
            c.supply
        );
        c_.initialize(t_);
        token = address(t_);
        curve = address(c_);
        launches[token] = Launch(curve, msg.sender, uint64(block.number), uint64(block.timestamp));
        allTokens.push(token);
        _byDeployer[msg.sender].push(token);
        emit TokenLaunched(token, curve, msg.sender, pairToken, launchConfigId, 0);

        if (msg.value > 0) {
            (bool ok,) = treasury.call{value: msg.value}("");
            require(ok, "fee transfer");
        }
    }

    // ---- owner ----

    function setOwner(address owner_) external onlyOwner {
        require(owner_ != address(0), "zero");
        owner = owner_;
        emit OwnerChanged(owner_);
    }

    function setTreasury(address treasury_) external onlyOwner {
        require(treasury_ != address(0), "zero");
        treasury = treasury_;
        emit TreasuryChanged(treasury_);
    }

    function setTerms(uint256 launchFee_, uint256 maxCreatorTaxBps_, uint16 protocolFeeShareBps_) external onlyOwner {
        require(maxCreatorTaxBps_ <= 1_000 && protocolFeeShareBps_ <= 10_000, "bounds");
        launchFee = launchFee_;
        maxCreatorTaxBps = maxCreatorTaxBps_;
        protocolFeeShareBps = protocolFeeShareBps_;
        emit TermsChanged(launchFee_, maxCreatorTaxBps_, protocolFeeShareBps_);
    }

    /// @notice Adds (id == count) or replaces a launch config. Existing curves keep their terms.
    function setLaunchConfig(uint256 id, LaunchConfig calldata c) external onlyOwner {
        require(c.supply > 0 && c.phantomQuote > 0 && c.curveFeeBps <= 500, "bounds");
        if (id == _configs.length) _configs.push(c);
        else _configs[id] = c;
        emit ConfigSet(id, c);
    }
}
