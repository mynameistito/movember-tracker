/**
 * Format duration in human-readable format
 * @param ms - Duration in milliseconds
 * @returns Formatted duration string (e.g., "2m 30s (150000ms)" or "45s (45000ms)")
 * @example
 * formatDuration(150000) // "2m 30s (150000ms)"
 * formatDuration(45000) // "45s (45000ms)"
 */
export const formatDuration = (ms: number): string => {
	const seconds = Math.round(ms / 1000);
	const minutes = Math.floor(seconds / 60);
	const remainingSeconds = seconds % 60;

	if (minutes > 0) {
		return `${minutes}m ${remainingSeconds}s (${ms}ms)`;
	}
	return `${seconds}s (${ms}ms)`;
};

/**
 * Sleep for a specified duration (useful for delays/retries)
 * @param ms - Duration to sleep in milliseconds
 * @returns Promise that resolves after the specified duration
 * @example
 * await sleep(1000); // Sleep for 1 second
 */
export const sleep = (ms: number): Promise<void> =>
	new Promise((resolve) => setTimeout(resolve, ms));

