/**
 * OAuth Popup Handler
 * Handles GitHub OAuth flow in a popup window
 */

interface OAuthResult {
  token: string;
  user: {
    id: number;
    username: string;
    email: string;
    name: string;
    avatar: string;
    profileUrl: string;
  };
}

export function openOAuthPopup(url: string): Promise<OAuthResult> {
  return new Promise((resolve, reject) => {
    // Popup dimensions
    const width = 600;
    const height = 700;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;

    // Open popup window
    const popup = window.open(
      url,
      'GitHub OAuth',
      `width=${width},height=${height},left=${left},top=${top},toolbar=no,location=no,status=no,menubar=no,scrollbars=yes`
    );

    if (!popup) {
      reject(new Error('Popup blocked. Please allow popups for this site.'));
      return;
    }

    // Listen for messages from the popup
    const messageHandler = (event: MessageEvent) => {
      // Verify origin for security
      const allowedOrigins = [
        window.location.origin,
        process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000'
      ];

      if (!allowedOrigins.some(origin => event.origin.startsWith(origin))) {
        return;
      }

      if (event.data.type === 'OAUTH_SUCCESS') {
        window.removeEventListener('message', messageHandler);
        popup.close();
        resolve(event.data.payload);
      } else if (event.data.type === 'OAUTH_ERROR') {
        window.removeEventListener('message', messageHandler);
        popup.close();
        reject(new Error(event.data.error || 'OAuth failed'));
      }
    };

    window.addEventListener('message', messageHandler);

    // Check if popup was closed manually
    const checkClosed = setInterval(() => {
      if (popup.closed) {
        clearInterval(checkClosed);
        window.removeEventListener('message', messageHandler);
        reject(new Error('OAuth cancelled by user'));
      }
    }, 500);

    // Timeout after 5 minutes
    setTimeout(() => {
      if (!popup.closed) {
        popup.close();
        window.removeEventListener('message', messageHandler);
        reject(new Error('OAuth timeout'));
      }
    }, 5 * 60 * 1000);
  });
}
