import { readFile } from "node:fs/promises";
import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";

import { Window } from "happy-dom";

import { fetchMovemberPage } from "../src/movember-proxy.js";

const main = async (): Promise<void> => {
  const browser = new Window({ url: "http://localhost" });
  Object.defineProperties(globalThis, {
    window: { value: browser, configurable: true },
    document: { value: browser.document, configurable: true },
    DOMParser: { value: browser.DOMParser, configurable: true },
    localStorage: { value: browser.localStorage, configurable: true },
  });

  const input = createInterface({ input: stdin, output: stdout });

  try {
    const { extractAmounts } =
      await import("../src/client/scraper/html-parsing.js");

    const { parseAmount, calculatePercentage } =
      await import("../src/client/parsing.js");

    const mode = await input.question(
      "Input: 1 Movember URL, 2 HTML file, 3 manual amounts [2]: "
    );

    if (!["", "1", "2", "3"].includes(mode)) {
      throw new Error("Choose mode 1, 2, or 3");
    }

    let defaultCountry = "au";
    let raised: string;
    let target: string;

    if (mode === "3") {
      raised = await input.question("Raised amount: ");
      target = await input.question("Target amount: ");
    } else {
      let html: string;

      if (mode === "1") {
        const url = await input.question("HTTPS Movember URL: ");
        const page = await fetchMovemberPage(url);
        ({ html } = page);
        [defaultCountry] = new URL(page.finalUrl).hostname.split(".");
      } else {
        const filename = await input.question(
          "HTML file [movember-html.html]: "
        );

        html = await readFile(filename || "movember-html.html", "utf-8");
      }

      const amounts = extractAmounts(html, "local", defaultCountry);
      ({ raised } = amounts);
      ({ target } = amounts);
    }

    const country =
      (await input.question(`Country subdomain [${defaultCountry}]: `)) ||
      defaultCountry;

    const amount = parseAmount(raised, country);
    const goal = parseAmount(target, country);
    console.log(
      JSON.stringify(
        {
          amount,
          target: goal,
          percentage: calculatePercentage(amount.value, goal.value),
        },
        null,
        2
      )
    );
  } finally {
    input.close();
    await browser.happyDOM.close();
  }
};

try {
  await main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
