/** Whether the page is in a background tab; polls skip their reads while it is. */
export const pageHidden = () => typeof document !== "undefined" && document.visibilityState === "hidden";
