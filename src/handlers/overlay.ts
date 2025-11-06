import type { Env } from '../types';
import { DEFAULT_MEMBER_ID } from '../constants';
import { getData } from './data';

export async function handleOverlay(request: Request, env: Env, requestStartTime: number): Promise<Response> {
  const { data, cacheStatus } = await getData(env, request);
  const url = new URL(request.url);
  const memberId = url.searchParams.get("memberId") || url.searchParams.get("memberid") || DEFAULT_MEMBER_ID;
  
  const percentage = data.percentage || 0;
  const amount = data.amount || "$0";
  const target = data.target || "$0";
  const currentMemberId = memberId;
  
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Movember Donation Progress</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      background: transparent;
      color: #fff;
      padding: 20px;
    }
    .container {
      width: 100%;
      max-width: 1200px;
    }
    .progress-container {
      display: flex;
      flex-direction: column;
      gap: 15px;
      width: 100%;
    }
    .amounts-row {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      width: 100%;
    }
    .amount-label {
      font-size: 48px;
      font-weight: 700;
      letter-spacing: -0.02em;
      white-space: nowrap;
      transition: opacity 0.3s ease;
    }
    .amount-label.updating {
      opacity: 0.7;
    }
    .target-label {
      font-size: 24px;
      font-weight: 500;
      letter-spacing: -0.01em;
      white-space: nowrap;
      color: #aaa;
      transition: opacity 0.3s ease;
    }
    .target-label.updating {
      opacity: 0.7;
    }
    .target-label .target-prefix {
      font-size: 20px;
      font-weight: 400;
      margin-right: 8px;
    }
    .progress-bar-wrapper {
      width: 100%;
      height: 60px;
      background: #000;
      border-radius: 30px;
      position: relative;
      overflow: hidden;
      border: 2px solid rgba(255, 255, 255, 0.2);
    }
    .progress-bar-fill {
      height: 100%;
      width: ${Math.min(percentage, 100)}%;
      background: linear-gradient(90deg, #4CAF50 0%, #45a049 100%);
      border-radius: 30px;
      transition: width 0.5s ease;
    }
    @media (max-width: 768px) {
      .amounts-row {
        flex-direction: column;
        gap: 10px;
        align-items: flex-start;
      }
      .amount-label {
        font-size: 36px;
      }
      .target-label {
        font-size: 20px;
      }
      .target-label .target-prefix {
        font-size: 18px;
      }
      .progress-bar-wrapper {
        width: 100%;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="progress-container">
      <div class="amounts-row">
        <div class="amount-label" id="amount">${amount}</div>
        <div class="target-label" id="target"><span class="target-prefix">Target:</span>${target}</div>
      </div>
      <div class="progress-bar-wrapper">
        <div class="progress-bar-fill" id="progressBar"></div>
      </div>
    </div>
  </div>
  <script>
    const amountElement = document.getElementById('amount');
    const targetElement = document.getElementById('target');
    const progressBar = document.getElementById('progressBar');
    let currentData = {
      amount: '${amount}',
      target: '${target}',
      percentage: ${percentage}
    };
    
    // Get memberId from URL query parameters
    const urlParams = new URLSearchParams(window.location.search);
    const memberId = urlParams.get('memberId') || urlParams.get('memberid') || '${currentMemberId}';
    
    async function updateData() {
      try {
        const jsonUrl = '/json' + (memberId ? '?memberId=' + encodeURIComponent(memberId) : '');
        const response = await fetch(jsonUrl);
        const data = await response.json();
        
        if (data.amount && (data.amount !== currentData.amount || data.target !== currentData.target)) {
          amountElement.classList.add('updating');
          targetElement.classList.add('updating');
          
          setTimeout(() => {
            amountElement.textContent = data.amount || '$0';
            targetElement.innerHTML = '<span class="target-prefix">Target:</span>' + (data.target || '$0');
            const percentage = data.percentage || 0;
            progressBar.style.width = Math.min(percentage, 100) + '%';
            currentData = {
              amount: data.amount || '$0',
              target: data.target || '$0',
              percentage: percentage
            };
            amountElement.classList.remove('updating');
            targetElement.classList.remove('updating');
          }, 150);
        }
      } catch (error) {
        console.error('Failed to update data:', error);
      }
    }
    
    // Update every 30 seconds (cache is 5 minutes, but we check more frequently)
    setInterval(updateData, 30000);
    
    // Also update immediately on page load after a short delay
    setTimeout(updateData, 1000);
  </script>
</body>
</html>`;

  const duration = Date.now() - requestStartTime;
  console.log(`[RESPONSE] Overlay HTML response sent in ${duration}ms`, {
    cache: cacheStatus,
    amount: data.amount,
  });
  
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=UTF-8",
      "x-cache": cacheStatus,
    },
  });
}

