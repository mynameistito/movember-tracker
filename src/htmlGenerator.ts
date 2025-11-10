/**
 * Generate HTML overlay with donation progress
 * Semi-transparent overlay for OBS with backdrop blur
 * Uses browser localStorage to cache data and refresh every 5 minutes
 */
export function generateOverlayHTML(): string {
	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=1920, height=1080">
	<title>Movember Donation Progress</title>
	<link rel="preconnect" href="https://fonts.googleapis.com">
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
	<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
	<script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="absolute inset-0 bg-transparent text-white font-['Inter',system-ui,sans-serif]">
	<div class="absolute bg-black/75 backdrop-blur-md rounded-xl p-5 min-w-[320px] transition-all duration-300" id="overlayContainer">
		<div class="flex flex-col gap-4">
			<div class="flex flex-row justify-between items-baseline gap-6">
				<div class="flex flex-col">
					<div class="text-[11px] uppercase tracking-wider opacity-70 mb-1 font-medium">Current Donations</div>
					<div class="text-2xl font-semibold leading-tight transition-opacity duration-300" id="amount">-</div>
				</div>
				<div class="flex flex-col">
					<div class="text-[11px] uppercase tracking-wider opacity-70 mb-1 font-medium">Target</div>
					<div class="text-2xl font-semibold leading-tight transition-opacity duration-300" id="target">-</div>
				</div>
			</div>
			
			<div class="flex flex-col gap-2">
				<div class="bg-white/20 rounded-md h-2 overflow-hidden relative">
					<div class="h-full bg-gradient-to-r from-green-500 to-green-600 rounded-md transition-all duration-500 ease-in-out" id="progressBar" style="width: 0%"></div>
				</div>
				<div class="text-sm font-semibold opacity-90" id="percentage">-</div>
			</div>
			
			<div class="text-[10px] opacity-60 text-right mt-1" id="last-updated">Loading...</div>
		</div>
	</div>
	
	<script type="module">
		import { DEFAULT_MEMBER_ID, getData, getTeamData } from './js/bundle.js';
		
		// Get URL parameters
		const urlParams = new URLSearchParams(window.location.search);
		const teamId = urlParams.get('teamId') || urlParams.get('teamid');
		const memberId = urlParams.get('memberId') || urlParams.get('memberid') || (teamId ? null : DEFAULT_MEMBER_ID);
		
		// Parse location parameter from URL (case-insensitive), default to bottomright
		const locationParam = urlParams.get('location');
		const validLocations = ['topright', 'topleft', 'bottomleft', 'bottomright'];
		const overlayLocation = locationParam ? validLocations.find(loc => loc.toLowerCase() === locationParam.toLowerCase()) : null;
		const position = overlayLocation || 'bottomright';
		
		// Function to apply positioning classes based on location
		function applyPosition(position) {
			const overlayContainer = document.getElementById('overlayContainer');
			if (!overlayContainer) return;
			
			// Remove all position classes
			overlayContainer.classList.remove('top-6', 'right-6', 'bottom-6', 'left-6');
			
			// Add new position classes
			switch (position) {
				case 'topright':
					overlayContainer.classList.add('top-6', 'right-6');
					break;
				case 'topleft':
					overlayContainer.classList.add('top-6', 'left-6');
					break;
				case 'bottomleft':
					overlayContainer.classList.add('bottom-6', 'left-6');
					break;
				case 'bottomright':
				default:
					overlayContainer.classList.add('bottom-6', 'right-6');
					break;
			}
		}
		
		// Apply position on initial load
		applyPosition(position);
		
		// Watch for URL parameter changes (for dynamic updates)
		let lastPosition = position;
		setInterval(() => {
			const currentParams = new URLSearchParams(window.location.search);
			const currentLocationParam = currentParams.get('location');
			const currentOverlayLocation = currentLocationParam ? validLocations.find(loc => loc.toLowerCase() === currentLocationParam.toLowerCase()) : null;
			const currentPosition = currentOverlayLocation || 'bottomright';
			
			if (currentPosition !== lastPosition) {
				lastPosition = currentPosition;
				applyPosition(currentPosition);
			}
		}, 100); // Check every 100ms for URL changes
		
		// Parse interval from URL query parameter (in seconds), default to 300 seconds (5 minutes)
		const intervalParam = urlParams.get('interval');
		const intervalSeconds = intervalParam ? parseInt(intervalParam, 10) : 300;
		const REFRESH_INTERVAL = (intervalSeconds > 0 ? intervalSeconds : 300) * 1000; // Convert to milliseconds
		
		function formatTime(date) {
			const hours = date.getHours().toString().padStart(2, '0');
			const minutes = date.getMinutes().toString().padStart(2, '0');
			return hours + ':' + minutes;
		}
		
		function updateDisplay(data) {
			const percentage = data.percentage ?? 0;
			const amount = data.amount || '-';
			const target = data.target || '-';
			const hasData = data.amount && data.amount !== '-' && data.amount !== '$0';
			
			// Update stats
			document.getElementById('amount').textContent = hasData ? amount : '-';
			document.getElementById('target').textContent = hasData ? target : '-';
			
			// Update bar
			const progressBar = document.getElementById('progressBar');
			progressBar.style.width = hasData ? Math.min(percentage, 100) + '%' : '0%';
			
			// Update percentage
			document.getElementById('percentage').textContent = hasData ? percentage.toFixed(1) + '%' : 'No data';
			
			// Update timestamp
			const now = new Date();
			document.getElementById('last-updated').textContent = 'Updated: ' + formatTime(now);
		}
		
		async function fetchData() {
			try {
				// Use the client-side scraper functions
				const { data } = teamId 
					? await getTeamData(teamId)
					: await getData(memberId);
				
				updateDisplay(data);
			} catch (error) {
				console.error('Error fetching data:', error);
				document.getElementById('percentage').textContent = 'Error';
				document.getElementById('last-updated').textContent = 'Error loading data';
			}
		}
		
		async function loadData() {
			// Fetch fresh data (client-side scraper handles caching internally)
			await fetchData();
		}
		
		// Load data on page load
		loadData();
		
		// Auto-refresh at configured interval
		setInterval(() => {
			fetchData();
		}, REFRESH_INTERVAL);
	</script>
</body>
</html>`;
}
