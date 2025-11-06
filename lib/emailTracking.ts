export function withTracking(html: string, campaignId: string, trackingToken: string, baseUrl: string) {
  const pixel = `<img src="${baseUrl}/api/track/open?c=${campaignId}&t=${trackingToken}" width="1" height="1" style="display:none" alt="" />`;
  const wrapped = html.replace(/href="([^"]+)"/g, (_m, url) =>
    `href="${baseUrl}/api/track/click?c=${campaignId}&t=${trackingToken}&u=${encodeURIComponent(url)}"`
  );
  return wrapped + pixel;
}
