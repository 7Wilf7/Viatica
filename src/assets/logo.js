// Single source of truth for the in-app product logo asset.
// The original source artwork lives in resources/brand/viatica-logo.png.
// The boot splash copy preserves every visible source pixel inside the
// double-line border and makes only the outside canvas transparent.
// Other in-app placements use a resized display copy to keep routine UI lighter.
// PWA launcher icons are generated copies in public/icons/ for manifest use.
import bootLogoUrl from "../../resources/brand/viatica-logo-splash.png";
import productLogoUrl from "../../resources/brand/viatica-logo-display.png";

export { bootLogoUrl, productLogoUrl };
