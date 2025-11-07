/**
 * Local testing script for manual data input
 * Allows you to test the HTML parsing logic with custom HTML or manually provided data
 *
 * Usage:
 *   bun run test:local
 *   or
 *   npm run test:local
 */

// Mock browser globals for Node.js/Bun environment BEFORE any imports
// This must happen before logger.ts is loaded since it initializes at module load time
if (typeof window === "undefined") {
	// Use happy-dom to provide DOMParser and other browser APIs
	// For Bun, we can use top-level await, but we'll set up a basic mock first
	// and enhance it in the main function
	// biome-ignore lint/suspicious/noExplicitAny: Need to mock window for Node.js environment
	(globalThis as any).window = {
		location: {
			hostname: "localhost",
			search: "",
		},
	};

	// biome-ignore lint/suspicious/noExplicitAny: Need to mock localStorage for Node.js environment
	(globalThis as any).localStorage = {
		getItem: () => null,
		setItem: () => {},
	};
}

// Use dynamic imports to ensure mocks are set up first
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Simple readline interface
function askQuestion(question: string): Promise<string> {
	return new Promise((resolve) => {
		process.stdout.write(question);
		process.stdin.once("data", (data) => {
			resolve(data.toString().trim());
		});
	});
}

async function main() {
	// Set up DOMParser using happy-dom if not already available
	if (typeof DOMParser === "undefined") {
		try {
			const { Window } = await import("happy-dom");
			const happyWindow = new Window();

			// biome-ignore lint/suspicious/noExplicitAny: Need to mock DOMParser for Node.js environment
			(globalThis as any).DOMParser = happyWindow.DOMParser;
			// biome-ignore lint/suspicious/noExplicitAny: Need to mock document for Node.js environment
			(globalThis as any).document = happyWindow.document;
			// biome-ignore lint/suspicious/noExplicitAny: Need to enhance window for Node.js environment
			(globalThis as any).window.DOMParser = happyWindow.DOMParser;
		} catch (error) {
			console.warn(
				"Could not load happy-dom, DOMParser will not be available:",
				error,
			);
		}
	}

	// Dynamically import after mocks are set up
	const { extractAmounts } = await import(
		"../src/client/scraper/html-parsing.js"
	);

	console.log("=".repeat(60));
	console.log("Local HTML Parsing Test Tool");
	console.log("=".repeat(60));
	console.log();

	// Ask for input method
	console.log("How would you like to provide data?");
	console.log("1. Fetch HTML from Movember URL");
	console.log("2. Load HTML from file (e.g., movember-html.html)");
	console.log("3. Manually enter raised and target amounts");
	console.log();

	const choice = await askQuestion("Enter choice (1-3): ");

	let html = "";
	let raised = "";
	let target = "";
	let url = "";

	if (choice === "1") {
		url = await askQuestion(
			"Enter Movember URL (e.g., https://us.movember.com/mospace/12345678): ",
		);
		if (!url) {
			console.error("✗ URL is required");
			process.exit(1);
		}

		console.log();
		console.log(`Fetching HTML from ${url}...`);
		try {
			const response = await fetch(url, {
				headers: {
					"User-Agent":
						"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
					Accept:
						"text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
					"Accept-Language": "en-US,en;q=0.9",
				},
				redirect: "follow",
			});

			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}

			html = await response.text();
			const finalUrl = response.url;
			console.log(`✓ Fetched ${html.length} characters from ${finalUrl}`);
			if (finalUrl !== url) {
				console.log(`  (redirected from ${url})`);
			}
		} catch (error) {
			console.error(`✗ Error fetching URL: ${error}`);
			process.exit(1);
		}
	} else if (choice === "2") {
		const filePath = await askQuestion(
			"Enter file path (or press Enter for 'movember-html.html'): ",
		);
		const pathToUse = filePath || "movember-html.html";
		try {
			const fullPath = join(process.cwd(), pathToUse);
			if (!existsSync(fullPath)) {
				console.error(`✗ File not found: ${fullPath}`);
				process.exit(1);
			}
			html = readFileSync(fullPath, "utf-8");
			console.log(`✓ Loaded ${html.length} characters from ${fullPath}`);
		} catch (error) {
			console.error(`✗ Error reading file: ${error}`);
			process.exit(1);
		}
	} else if (choice === "3") {
		raised = await askQuestion(
			"Enter raised amount (e.g., '1234' or '$1,234'): ",
		);
		target = await askQuestion(
			"Enter target amount (e.g., '5000' or '$5,000') or press Enter to skip: ",
		);
	} else {
		console.error("Invalid choice");
		process.exit(1);
	}

	console.log();
	console.log("=".repeat(60));
	console.log("Results:");
	console.log("=".repeat(60));

	if (choice === "2") {
		// Manual entry - just display what was entered
		console.log();
		console.log("Raised amount:", raised || "(not provided)");
		console.log("Target amount:", target || "(not provided)");
		console.log();
		console.log("You can use these values to test your application logic.");
	} else {
		// Parse HTML
		if (!html) {
			console.error("No HTML provided");
			process.exit(1);
		}

		console.log();
		console.log(`Parsing ${html.length} characters of HTML...`);
		console.log();

		try {
			// Try to extract subdomain from URL if available
			let subdomain = "us";
			if (url) {
				const subdomainMatch = url.match(
					/https?:\/\/([a-z]{2})\.movember\.com/,
				);
				if (subdomainMatch) {
					subdomain = subdomainMatch[1];
				}
			}

			const memberId = "test-member";
			const result = extractAmounts(html, memberId, subdomain);

			console.log();
			console.log("Extracted Data:");
			console.log("  Raised:", result.raised || "(NOT FOUND)");
			console.log("  Target:", result.target || "(NOT FOUND)");
			console.log();

			// Ask user to verify/correct the extracted data
			if (result.raised || result.target) {
				console.log("Please verify the extracted data:");
				console.log();
				const correctRaised = await askQuestion(
					`Is the raised amount correct? (${result.raised || "NOT FOUND"}) [Enter to keep, or type correct value]: `,
				);
				const correctTarget = await askQuestion(
					`Is the target amount correct? (${result.target || "NOT FOUND"}) [Enter to keep, or type correct value]: `,
				);

				if (correctRaised || correctTarget) {
					console.log();
					console.log("Corrected Data:");
					if (correctRaised) {
						console.log("  Raised:", correctRaised);
					} else {
						console.log("  Raised:", result.raised || "(NOT FOUND)");
					}
					if (correctTarget) {
						console.log("  Target:", correctTarget);
					} else {
						console.log("  Target:", result.target || "(NOT FOUND)");
					}
					console.log();
					console.log(
						"You can use this information to improve the parsing patterns.",
					);
				}

				// Offer to debug DOMParser if it didn't find the data
				if (typeof DOMParser !== "undefined") {
					console.log();
					const debugDom = await askQuestion(
						"DOMParser didn't find the amounts. Would you like to debug the HTML structure? (y/n): ",
					);
					if (debugDom.toLowerCase() === "y") {
						const parser = new DOMParser();
						const doc = parser.parseFromString(html, "text/html");

						// Try to find elements containing the amounts
						const raisedValue = result.raised || correctRaised || "";
						const targetValue = result.target || correctTarget || "";

						// First, check if the specific span elements exist
						console.log();
						console.log(
							"Checking for span elements with donationProgress classes...",
						);
						const raisedSpans = doc.querySelectorAll(
							"span.donationProgress--amount__raised, span[class*='donationProgress--amount__raised']",
						);
						const targetSpans = doc.querySelectorAll(
							"span.donationProgress--amount__target, span[class*='donationProgress--amount__target']",
						);

						console.log(
							`Found ${raisedSpans.length} span elements with donationProgress--amount__raised class`,
						);
						console.log(
							`Found ${targetSpans.length} span elements with donationProgress--amount__target class`,
						);

						if (raisedSpans.length > 0) {
							console.log();
							console.log("Raised span elements:");
							Array.from(raisedSpans)
								.slice(0, 3)
								.forEach((el, i) => {
									const text = el.textContent || "";
									const classes = el.className || "";
									console.log(`  ${i + 1}. Classes: ${classes}`);
									console.log(`     Text: ${text.substring(0, 100)}...`);
								});
						}

						if (targetSpans.length > 0) {
							console.log();
							console.log("Target span elements:");
							Array.from(targetSpans)
								.slice(0, 3)
								.forEach((el, i) => {
									const text = el.textContent || "";
									const classes = el.className || "";
									console.log(`  ${i + 1}. Classes: ${classes}`);
									console.log(`     Text: ${text.substring(0, 100)}...`);
								});
						}

						if (raisedValue) {
							console.log();
							console.log("Searching for raised amount in HTML structure...");
							// Find all elements that might contain the raised amount
							const allElements = doc.querySelectorAll("*");
							const foundElements: Array<{
								element: string;
								text: string;
								classes: string;
							}> = [];
							for (const el of Array.from(allElements)) {
								const text = el.textContent || "";
								if (text.includes(raisedValue.replace(/[.,]/g, ""))) {
									const tagName = el.tagName.toLowerCase();
									const classes = el.className || "";
									const id = el.id || "";
									foundElements.push({
										element: `${tagName}${id ? `#${id}` : ""}${classes ? `.${classes.split(" ").join(".")}` : ""}`,
										text: text.substring(0, 100),
										classes: classes || "(no classes)",
									});
									if (foundElements.length >= 5) break; // Limit to first 5 matches
								}
							}
							if (foundElements.length > 0) {
								console.log(
									`Found ${foundElements.length} elements containing raised amount:`,
								);
								foundElements.forEach((item, i) => {
									console.log(`  ${i + 1}. ${item.element}`);
									console.log(`     Classes: ${item.classes}`);
									console.log(`     Text: ${item.text}...`);
								});
							}
						}

						if (targetValue) {
							console.log();
							console.log("Searching for target amount in HTML structure...");
							const allElements = doc.querySelectorAll("*");
							const foundElements: Array<{
								element: string;
								text: string;
								classes: string;
							}> = [];
							for (const el of Array.from(allElements)) {
								const text = el.textContent || "";
								if (text.includes(targetValue.replace(/[.,]/g, ""))) {
									const tagName = el.tagName.toLowerCase();
									const classes = el.className || "";
									const id = el.id || "";
									foundElements.push({
										element: `${tagName}${id ? `#${id}` : ""}${classes ? `.${classes.split(" ").join(".")}` : ""}`,
										text: text.substring(0, 200),
										classes: classes || "(no classes)",
									});
									if (foundElements.length >= 5) break;
								}
							}
							if (foundElements.length > 0) {
								console.log(
									`Found ${foundElements.length} elements containing target amount:`,
								);
								foundElements.forEach((item, i) => {
									console.log(`  ${i + 1}. ${item.element}`);
									console.log(`     Classes: ${item.classes}`);
									if (item.element === "script") {
										// For script tags, try to find JSON structure
										const scriptText = item.text;
										const jsonMatch = scriptText.match(
											/\{[^}]*"target"[^}]*\}/,
										);
										if (jsonMatch) {
											console.log(
												`     JSON snippet: ${jsonMatch[0].substring(0, 150)}...`,
											);
										}
										// Look for the amount in context
										const amountIndex = scriptText.indexOf(
											targetValue.replace(/[.,]/g, ""),
										);
										if (amountIndex !== -1) {
											const context = scriptText.substring(
												Math.max(0, amountIndex - 100),
												Math.min(scriptText.length, amountIndex + 100),
											);
											console.log(
												`     Context around amount: ...${context}...`,
											);
										}
									} else {
										console.log(`     Text: ${item.text}...`);
									}
								});
							}
						}

						// Also check script tags for JSON data
						console.log();
						console.log("Checking script tags for JSON data...");

						// Check what the regex patterns are actually matching
						if (raisedValue) {
							console.log();
							console.log("Finding where raised amount appears in HTML...");
							// Try the actual regex patterns
							const raisedPattern1 =
								/"AmountRaised"[^}]*"(?:convertedAmount|originalAmount)"["\s:]*["']([\d,]+(?:\.\d+)?)/i;
							const match1 = html.match(raisedPattern1);
							if (match1) {
								const matchIndex = html.indexOf(match1[0]);
								const context = html.substring(
									Math.max(0, matchIndex - 200),
									Math.min(html.length, matchIndex + match1[0].length + 200),
								);
								console.log(`  Pattern 1 matched: ${match1[0]}`);
								console.log(`  Context: ...${context}...`);
							}

							// Also search for the amount directly
							const amountIndex = html.indexOf(raisedValue);
							if (amountIndex !== -1) {
								const context = html.substring(
									Math.max(0, amountIndex - 300),
									Math.min(html.length, amountIndex + raisedValue.length + 300),
								);
								console.log();
								console.log(
									`  Found amount "${raisedValue}" at position ${amountIndex}:`,
								);
								console.log(`  Context: ...${context}...`);
							}
						}

						if (targetValue) {
							console.log();
							console.log("Finding where target amount appears in HTML...");
							// Try the actual regex patterns
							const targetPattern1 =
								/"target"[^}]*"fundraising"[^}]*"value"["\s:]*["']([\d,]+(?:\.\d+)?)/i;
							const match1 = html.match(targetPattern1);
							if (match1) {
								const matchIndex = html.indexOf(match1[0]);
								const context = html.substring(
									Math.max(0, matchIndex - 200),
									Math.min(html.length, matchIndex + match1[0].length + 200),
								);
								console.log(`  Pattern 1 matched: ${match1[0]}`);
								console.log(`  Context: ...${context}...`);
							}

							// Also search for the amount directly
							const amountIndex = html.indexOf(targetValue);
							if (amountIndex !== -1) {
								const context = html.substring(
									Math.max(0, amountIndex - 300),
									Math.min(html.length, amountIndex + targetValue.length + 300),
								);
								console.log();
								console.log(
									`  Found amount "${targetValue}" at position ${amountIndex}:`,
								);
								console.log(`  Context: ...${context}...`);
							}
						}

						// Check script tags for JSON
						const scriptTags = doc.querySelectorAll("script");
						let jsonScriptsFound = 0;
						for (const script of Array.from(scriptTags)) {
							const scriptContent =
								script.textContent || script.innerHTML || "";
							// Look for the actual amounts in script tags
							if (
								(raisedValue &&
									scriptContent.includes(raisedValue.replace(/[.,]/g, ""))) ||
								(targetValue &&
									scriptContent.includes(targetValue.replace(/[.,]/g, "")))
							) {
								jsonScriptsFound++;
								if (jsonScriptsFound <= 2) {
									console.log();
									console.log(
										`Script tag ${jsonScriptsFound} (contains amounts):`,
									);

									// Try to find JSON objects containing the amounts
									// Look for JSON-like structures around the amounts
									if (raisedValue) {
										const raisedIndex = scriptContent.indexOf(
											raisedValue.replace(/[.,]/g, ""),
										);
										if (raisedIndex !== -1) {
											// Try to extract a JSON object containing this
											const before = scriptContent.substring(
												Math.max(0, raisedIndex - 500),
												raisedIndex,
											);
											const after = scriptContent.substring(
												raisedIndex,
												Math.min(scriptContent.length, raisedIndex + 500),
											);

											// Find the opening brace before
											const braceStart = before.lastIndexOf("{");
											if (braceStart !== -1) {
												// Try to find the matching closing brace
												const jsonCandidate = scriptContent.substring(
													before.lastIndexOf("{"),
													Math.min(scriptContent.length, raisedIndex + 1000),
												);
												// Try to extract a valid JSON object
												const jsonMatch = jsonCandidate.match(
													/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/,
												);
												if (jsonMatch) {
													try {
														const jsonObj = JSON.parse(jsonMatch[0]);
														console.log(
															`  Contains JSON with raised: ${JSON.stringify(jsonObj, null, 2).substring(0, 500)}...`,
														);
													} catch {
														console.log(
															`  JSON-like structure: ${jsonMatch[0].substring(0, 300)}...`,
														);
													}
												} else {
													console.log(
														`  Context around raised: ...${before.substring(before.length - 100)}${after.substring(0, 100)}...`,
													);
												}
											}
										}
									}

									if (targetValue) {
										const targetIndex = scriptContent.indexOf(
											targetValue.replace(/[.,]/g, ""),
										);
										if (targetIndex !== -1) {
											const before = scriptContent.substring(
												Math.max(0, targetIndex - 500),
												targetIndex,
											);
											const after = scriptContent.substring(
												targetIndex,
												Math.min(scriptContent.length, targetIndex + 500),
											);

											const braceStart = before.lastIndexOf("{");
											if (braceStart !== -1) {
												const jsonCandidate = scriptContent.substring(
													before.lastIndexOf("{"),
													Math.min(scriptContent.length, targetIndex + 1000),
												);
												const jsonMatch = jsonCandidate.match(
													/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/,
												);
												if (jsonMatch) {
													try {
														const jsonObj = JSON.parse(jsonMatch[0]);
														console.log(
															`  Contains JSON with target: ${JSON.stringify(jsonObj, null, 2).substring(0, 500)}...`,
														);
													} catch {
														console.log(
															`  JSON-like structure: ${jsonMatch[0].substring(0, 300)}...`,
														);
													}
												} else {
													console.log(
														`  Context around target: ...${before.substring(before.length - 100)}${after.substring(0, 100)}...`,
													);
												}
											}
										}
									}
								}
							}
						}
						if (jsonScriptsFound === 0) {
							console.log("No script tags found containing the amounts");
						}
					}
				}
			}

			if (!result.raised && !result.target) {
				console.log("⚠️  No amounts found in HTML.");
				console.log();
				console.log("Debug options:");
				console.log("1. Show first 1000 characters of HTML");
				console.log("2. Search for specific text in HTML");
				console.log("3. Show all dollar amounts found");
				console.log("4. Exit");
				console.log();

				const debugChoice = await askQuestion("Enter choice (1-4): ");

				if (debugChoice === "1") {
					console.log();
					console.log("First 1000 characters of HTML:");
					console.log("-".repeat(60));
					console.log(html.substring(0, 1000));
					console.log("-".repeat(60));
				} else if (debugChoice === "2") {
					const searchTerm = await askQuestion(
						"Enter search term to find in HTML: ",
					);
					const index = html.toLowerCase().indexOf(searchTerm.toLowerCase());
					if (index !== -1) {
						const start = Math.max(0, index - 200);
						const end = Math.min(html.length, index + searchTerm.length + 200);
						console.log();
						console.log(`Found at position ${index}:`);
						console.log("-".repeat(60));
						console.log(html.substring(start, end));
						console.log("-".repeat(60));
					} else {
						console.log(`✗ Search term not found in HTML`);
					}
				} else if (debugChoice === "3") {
					const dollarMatches = [...html.matchAll(/\$([\d,]+(?:\.\d+)?)/g)];
					console.log();
					console.log(`Found ${dollarMatches.length} dollar amounts:`);
					dollarMatches.slice(0, 20).forEach((match, i) => {
						const index = match.index ?? 0;
						const context = html.substring(
							Math.max(0, index - 50),
							Math.min(html.length, index + 100),
						);
						console.log(
							`  ${i + 1}. $${match[1]} (context: ${context.replace(/\n/g, " ").substring(0, 80)}...)`,
						);
					});
				}
			} else {
				console.log("✓ Successfully extracted amounts!");
			}
		} catch (error) {
			console.error("Error parsing HTML:", error);
			process.exit(1);
		}
	}

	console.log();
	console.log("=".repeat(60));
	console.log("Test complete!");
	console.log("=".repeat(60));
}

// Handle stdin properly
process.stdin.setEncoding("utf8");
process.stdin.resume();

main().catch((error) => {
	console.error("Fatal error:", error);
	process.exit(1);
});
