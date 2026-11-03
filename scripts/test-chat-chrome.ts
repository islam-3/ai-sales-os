// The chat page paints everything around itself in the TENANT's colour.
//
//   npx tsx scripts/test-chat-chrome.ts
//
// FREE: reads source files.
//
// On an iPhone in dark mode, a light chat had a black strip under the
// composer and a black band behind the status bar. The page had no
// viewport-fit=cover, so iOS filled the safe areas itself from the page
// background, and that background was <body> under the dashboard's
// next-themes class, which follows the device. Three things have to come
// from the tenant's chat_theme for that not to happen, and each is
// checked here because each one alone was enough to cause it.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CHAT_SURFACE } from "../lib/branding";

let bad = 0;
const check = (name: string, pass: boolean, detail?: string) => {
  if (!pass) {
    bad++;
    console.log(`FAIL  ${name}${detail ? `\n      ${detail}` : ""}`);
  } else {
    console.log(`  ok  ${name}`);
  }
};

const root = join(__dirname, "..");
const page = readFileSync(join(root, "app/chat/[slug]/page.tsx"), "utf8");
const css = readFileSync(join(root, "app/chat/[slug]/chat.css"), "utf8");

// 1. One colour. The surface the chat paints and the colour around it
//    must be the same value, or a mismatched strip is back.
for (const theme of ["light", "dark"] as const) {
  const block = css.match(new RegExp(`\\.nx-chat\\[data-theme="${theme}"\\]\\s*\\{([^}]*)\\}`));
  const surface = block?.[1].match(/--surface:\s*(#[0-9a-fA-F]{3,8})\s*;/)?.[1];
  check(
    `chat.css --surface (${theme}) matches CHAT_SURFACE.${theme}`,
    surface?.toLowerCase() === CHAT_SURFACE[theme].toLowerCase(),
    `chat.css says ${surface ?? "nothing"}, lib/branding.ts says ${CHAT_SURFACE[theme]}`
  );
}

// 2. The viewport: drawn under the safe areas, tinted by the tenant.
check("the chat page exports generateViewport", /export async function generateViewport\(/.test(page));
check('viewport-fit is "cover"', /viewportFit:\s*"cover"/.test(page));
check("theme-color comes from CHAT_SURFACE", /themeColor:\s*CHAT_SURFACE\[theme\]/.test(page));

// 3. html/body: the tenant's colour, beating the next-themes class.
check(
  "html and body are painted from CHAT_SURFACE, with !important",
  /html,body\{background-color:\$\{CHAT_SURFACE\[theme\]\}!important/.test(page)
);
const backgrounds = page.match(/<ChatPageBackground /g)?.length ?? 0;
check("every branch of the page renders it (valid tenant and invalid link)", backgrounds === 2, `found ${backgrounds}`);

// 4. Never the device. The theme is the tenant's setting; nothing on this
//    page may ask what the phone prefers.
check(
  "the theme comes from the tenant's chat_theme",
  /chat_theme === "dark" \? "dark" : "light"/.test(page)
);
check(
  "nothing on the chat page reads the device colour scheme",
  !/prefers-color-scheme|useTheme|matchMedia/.test(page + css),
  "a device-dependent colour here is exactly the bug"
);

// 5. The insets the cover viewport hands to the page are actually used.
check("the header takes the top inset", /\.nx-header\s*\{[^}]*env\(safe-area-inset-top/.test(css));
check("the composer takes the bottom inset", /\.nx-composer\s*\{[^}]*env\(safe-area-inset-bottom/.test(css));
check(
  "the chat root takes the side insets (landscape notch)",
  /env\(safe-area-inset-left[^)]*\)[\s\S]{0,80}env\(safe-area-inset-right/.test(css)
);

if (bad > 0) {
  console.log(`\n${bad} failed`);
  process.exit(1);
}
console.log("\nthe chat page paints its surroundings in the tenant's colour");
