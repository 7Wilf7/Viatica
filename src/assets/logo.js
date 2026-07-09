// Single source of truth for the in-app product logo asset.
// The original source artwork lives in resources/brand/viatica-logo.png.
// The boot splash uses a transparent-background copy so its final frame keeps the source border
// without carrying the original black canvas around the rounded mark.
// Other in-app placements use a resized display copy to keep routine UI lighter.
// PWA launcher icons are generated copies in public/icons/ for manifest use.
import bootLogoUrl from "../../resources/brand/viatica-logo-splash.png";
import productLogoUrl from "../../resources/brand/viatica-logo-display.png";

export { bootLogoUrl, productLogoUrl };
