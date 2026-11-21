/** The stylesheet that makes a Google font usable in the page, for the preview under a font field. */
export const googleFontCss = (name: string): string => `https://fonts.googleapis.com/css2?family=${encodeURIComponent(name.trim()).replace(/%20/g, "+")}&display=swap`;

/** A name is previewed when Remotion knows it, or when the list could not be loaded and so nothing is known. */
export const previewableFont = (name: string, names: readonly string[], checked: boolean): boolean => {
  const n = name.trim();
  return n !== "" && (!checked || names.includes(n));
};
