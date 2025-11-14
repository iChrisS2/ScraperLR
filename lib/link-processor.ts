// Link processing utilities

// Extract ID from URL
export const extractId = (url: string): string | null => {
  const patterns = [
    /[?&]id=(\d+)/,
    /itemID=(\d+)/,
    /offer\/(\d+)\.html/,
    /item-(\d+)/,
    /item-micro-(\d+)/,
    /item-1688-(\d+)/,
    /\/product\/\w+\/(\d+)/,
    /\/agent\/\w+\/(\d+)\.html/
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
};

// Detect platform from URL
export const detectPlatform = (url: string): string => {
  if (url.includes("weidian.com")) return "weidian";
  if (url.includes("taobao.com") || url.includes("tmall.com")) return "taobao";
  if (url.includes("1688.com")) return "alibaba";
  
  // Check agent-specific platform indicators
  if (url.includes("shop_type=weidian") || url.includes("platform=WEIDIAN") || 
      url.includes("source=WD") || url.includes("/product/weidian/") || 
      url.includes("item-micro-")) return "weidian";
  
  if (url.includes("shop_type=taobao") || url.includes("platform=TAOBAO") || 
      url.includes("source=TB") || url.includes("/product/1/") || 
      url.includes("/product/taobao/")) return "taobao";
  
  if (url.includes("shop_type=ali_1688") || url.includes("platform=ALI_1688") || 
      url.includes("source=AL") || url.includes("/product/0/") || 
      url.includes("item-1688-")) return "alibaba";
  
  return "unknown";
};

// Simple validation - check if it has an ID or is a short link
export const isValidProductUrl = (url: string): boolean => {
  if (!url || typeof url !== 'string') return false;
  
  // Check for common short link patterns
  const shortLinkPatterns = [
    /ikako\.vip/,
    /kakobuy\.com/,
    /allapp\.link/,
    /oopbuy\.cc/,
    /s\.spblk\.com/,
    /e\.tb\.cn/,
    /s\.click\.taobao\.com/,
    /m\.tb\.cn/,
    /link\.acbuy\.com/,
    /t\.cn/,
    /bit\.ly/,
    /tinyurl\.com/
  ];
  
  // If it's a short link, consider it valid
  if (shortLinkPatterns.some(pattern => pattern.test(url))) {
    return true;
  }
  
  // Check if it has a product ID
  return extractId(url) !== null;
};

// Extract original URL from agent link
export const extractOriginalUrl = (agentLink: string): string | null => {
  if (!agentLink) return null;
  
  // Try to extract from KakoBuy links (with or without www)
  const kakobuyMatch = agentLink.match(/https:\/\/(www\.)?kakobuy\.com\/item\/details\?url=([^&]+)/);
  if (kakobuyMatch) {
    return decodeURIComponent(kakobuyMatch[2]);
  }
  
  return null;
};

// Convert any link to agent link
export const convertToAgent = (originalLink: string, agentCode: string, affCode: string): string => {
  const platform = detectPlatform(originalLink);
  const id = extractId(originalLink);

  if (!id) return "";

  const kakobuyFormats: Record<string, string> = {
    weidian: `https://www.kakobuy.com/item/details?url=https%3A%2F%2Fweidian.com%2Fitem.html%3FitemID%3D${id}&affcode=${affCode}`,
    taobao: `https://www.kakobuy.com/item/details?url=https%3A%2F%2Fitem.taobao.com%2Fitem.htm%3Fid%3D${id}&affcode=${affCode}`,
    alibaba: `https://www.kakobuy.com/item/details?url=https%3A%2F%2Fdetail.1688.com%2Foffer%2F${id}.html&affcode=${affCode}`,
  };

  return kakobuyFormats[platform] || "";
};

// Process any link and convert to KakoBuy link
export const processAnyLink = (inputLink: string, targetAgentCode: string, targetAffCode: string): {
  originalUrl: string | null;
  agentLink: string;
  qcLink: string;
} => {
  if (!inputLink || !isValidProductUrl(inputLink)) {
    return {
      originalUrl: null,
      agentLink: "",
      qcLink: ""
    };
  }

  // Check if it's already a KakoBuy link
  const isKakobuyLink = inputLink.includes('kakobuy.com/item/details');
  
  if (isKakobuyLink) {
    // Extract the original URL from the KakoBuy link
    const originalUrl = extractOriginalUrl(inputLink);
    
    if (originalUrl) {
      // Re-convert with the correct affiliate code
      const agentLink = convertToAgent(originalUrl, targetAgentCode, targetAffCode);
      return {
        originalUrl,
        agentLink,
        qcLink: "" // No QC link generation for now
      };
    }
  }

  // If it's not a KakoBuy link or extraction failed, treat as original URL
  const originalUrl = inputLink;
  const agentLink = convertToAgent(originalUrl, targetAgentCode, targetAffCode);

  return {
    originalUrl,
    agentLink,
    qcLink: "" // No QC link generation for now
  };
};

// Resolve short links using the existing API
export const resolveShortUrl = async (inputUrl: string): Promise<string> => {
  try {
    const response = await fetch('/api/resolve-url', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url: inputUrl }),
    });

    if (response.ok) {
      const data = await response.json();
      if (data.success && data.resolvedUrl) {
        return data.resolvedUrl;
      }
    }
  } catch (error) {
    console.error('Error resolving URL via API:', error);
  }
  
  return inputUrl;
};

// Async version that resolves short links using the API
export const processAnyLinkAsync = async (inputLink: string, targetAgentCode: string, targetAffCode: string): Promise<{
  originalUrl: string | null;
  agentLink: string;
  qcLink: string;
}> => {
  // Check if it's a short link that needs resolution
  const isShortLink = inputLink.includes('ikako.vip') || 
                     inputLink.includes('kakobuy.com') || 
                     inputLink.includes('allapp.link') ||
                     inputLink.includes('oopbuy.cc') ||
                     inputLink.includes('s.spblk.com') ||
                     inputLink.includes('e.tb.cn') ||
                     inputLink.includes('s.click.taobao.com') ||
                     inputLink.includes('m.tb.cn') ||
                     inputLink.includes('link.acbuy.com') ||
                     inputLink.includes('t.cn') ||
                     inputLink.includes('bit.ly') ||
                     inputLink.includes('tinyurl.com');
  
  if (isShortLink) {
    // Resolve the short link first
    const resolvedUrl = await resolveShortUrl(inputLink);
    // Then process the resolved URL
    return processAnyLink(resolvedUrl, targetAgentCode, targetAffCode);
  }
  
  // For non-short links, use the sync version
  return processAnyLink(inputLink, targetAgentCode, targetAffCode);
};

// Legacy function for backward compatibility
export const convertToKakoBuy = (originalLink: string, affCode: string = 'latam'): string => {
  return convertToAgent(originalLink, 'KakoBuy', affCode);
};

// Extract original URL from KakoBuy link
export const extractOriginalUrlFromKakoBuy = (kakobuyLink: string): string | null => {
  return extractOriginalUrl(kakobuyLink);
};
