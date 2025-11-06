// Mapping of member IDs to their subdomains (manual overrides)
// Format: "memberId": "subdomain"
// Example: "15023456": "fr" means member 15023456 uses fr.movember.com
// Note: Subdomains are now auto-detected from redirects, but you can override here if needed
export const MEMBER_SUBDOMAIN_MAP: Record<string, string> = {
  // Add manual overrides here if needed
  // Example: "15023456": "fr",
  // Example: "14810348": "au",
};

export const DEFAULT_SUBDOMAIN = "au"; // Default subdomain to try first
export const MOVEMBER_BASE_URL_TEMPLATE = "https://{subdomain}.movember.com/donate/details";
export const DEFAULT_MEMBER_ID = "14810348"; // Default member ID if none provided
export const CACHE_TTL = 300; // 5 minutes in seconds
export const SUBDOMAIN_CACHE_TTL = 86400; // 24 hours in seconds (subdomain mappings don't change often)
export const MAX_RETRIES = 3;
export const RETRY_DELAYS = [1000, 2000, 4000]; // Exponential backoff in milliseconds

