// Helper function to format duration in human-readable format
export const formatDuration = (ms) => {
	const seconds = Math.round(ms / 1000);
	const minutes = Math.floor(seconds / 60);
	const remainingSeconds = seconds % 60;

	if (minutes > 0) {
		return `${minutes}m ${remainingSeconds}s (${ms}ms)`;
	}
	return `${seconds}s (${ms}ms)`;
};

// Helper function to sleep
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
