import { NextRequest, NextResponse } from 'next/server'

// Proxy configuration - use DigitalOcean server for whitelisted IP
const PROXY_ENABLED = true
const DIGITALOCEAN_SERVER = 'http://174.138.36.254:3000'

// Direct API configuration (fallback)
const QC_API_URL = 'https://open.kakobuy.com/open/pic/qcImage'
const QC_TOKEN = process.env.QC_API_TOKEN || '6ba4ceb56a6134eb7b5feeac0b557b82'

// Error codes mapping
const ERROR_CODES = {
  TOKEN_REQUIRED: 'Token is required',
  INVALID_TOKEN: 'Invalid token',
  TOKEN_EXPIRED: 'Token has expired',
  DAILY_LIMIT_EXCEEDED: 'Daily query limit exceeded',
  GOODS_URL_REQUIRED: 'Goods URL is required',
  INVALID_GOODS_URL: 'Invalid goods URL',
  PRODUCT_NOT_FOUND: 'Product not found',
  NO_QC_IMAGES: 'No QC images found',
  API_ERROR: 'API Error',
  INVALID_RESPONSE: 'API returned invalid response format',
  INTERNAL_ERROR: 'Internal server error',
  PROXY_ERROR: 'Proxy server error',
} as const

interface QCImage {
  image_url: string
  product_name: string
  qc_date: string
}

interface QCGallery {
  id: string
  images: QCImage[]
  date: string
  time: string
  product_name: string
  image_count: number
}

interface QCAPIResponse {
  status: 'success' | 'error'
  data?: QCImage[]
  message?: string
}

/**
 * Resolve short links to their final destination URL
 */
async function resolveShortUrlIfNeeded(inputUrl: string): Promise<string> {
  try {
    const urlObj = new URL(inputUrl)
    const host = urlObj.hostname
    const shouldResolve = (
      host.includes('k.youshop10.com') ||
      host.includes('ikako.vip') ||
      host.includes('hipobuy.cn') ||
      host.includes('allapp.link') ||
      host.includes('link.acbuy.com')
    )
    if (!shouldResolve) return inputUrl

    // Try normal follow
    let res = await fetch(inputUrl, {
      method: 'GET',
      redirect: 'follow',
      headers: { 'User-Agent': 'Kakobuy-QC-API/1.0' },
    })
    if (res && res.url) {
      let finalUrl = res.url
      try {
        const finalObj = new URL(finalUrl)
        if (finalObj.hostname.includes('kakobuy.com')) {
          const urlParam = finalObj.searchParams.get('url')
          if (urlParam) finalUrl = decodeURIComponent(urlParam)
        }
      } catch { /* ignore */ }
      if (!new URL(finalUrl).hostname.includes(host)) return finalUrl
    }

    // Try manual redirect
    res = await fetch(inputUrl, {
      method: 'GET',
      redirect: 'manual',
      headers: { 'User-Agent': 'Kakobuy-QC-API/1.0' },
    })
    const manualLocation = res.headers.get('location')
    if (manualLocation) {
      let finalUrl = manualLocation
      try {
        const finalObj = new URL(finalUrl)
        if (finalObj.hostname.includes('kakobuy.com')) {
          const urlParam = finalObj.searchParams.get('url')
          if (urlParam) finalUrl = decodeURIComponent(urlParam)
        }
      } catch { /* ignore */ }
      return finalUrl
    }
  } catch {
    // Ignore resolution errors
  }
  return inputUrl
}

/**
 * Normalize any supported input URL into a direct product URL
 */
async function normalizeGoodsUrl(inputUrl: string): Promise<string> {
  let urlToUse = inputUrl.trim()
  try {
    const urlObj = new URL(urlToUse)
    // If Kakobuy wrapper, extract embedded URL
    if (urlObj.hostname.includes('kakobuy.com')) {
      const urlParam = urlObj.searchParams.get('url')
      if (urlParam) {
        urlToUse = decodeURIComponent(urlParam)
      }
    }
  } catch {
    // ignore
  }

  // Resolve known short links
  urlToUse = await resolveShortUrlIfNeeded(urlToUse)
  
  // Map agent links to direct product URLs when possible
  try {
    const finalObj = new URL(urlToUse)
    const host = finalObj.hostname

    // Helper functions
    const toWeidian = (id: string) => `https://weidian.com/item.html?itemID=${id}`
    const toTaobao = (id: string) => `https://item.taobao.com/item.htm?id=${id}`
    const to1688 = (id: string) => `https://detail.1688.com/offer/${id}.html`

    // CNFANS
    if (host.includes('cnfans.com')) {
      const id = finalObj.searchParams.get('id') || ''
      const platformParam = (
        finalObj.searchParams.get('platform') ||
        finalObj.searchParams.get('shop_type') ||
        finalObj.searchParams.get('shoptype') ||
        ''
      ).toUpperCase()
      if (id) {
        if (platformParam.includes('WEIDIAN') || platformParam === 'WD') return toWeidian(id)
        if (platformParam.includes('TAOBAO') || platformParam === 'TB') return toTaobao(id)
        if (platformParam.includes('ALI_1688') || platformParam.includes('1688') || platformParam === 'AL') return to1688(id)
      }
      return urlToUse
    }

    // HIPO BUY
    if (host.includes('hipobuy.com')) {
      const path = finalObj.pathname
      let match
      if ((match = path.match(/\/product\/weidian\/(\d+)/))) return toWeidian(match[1])
      if ((match = path.match(/\/product\/1\/(\d+)/))) return toTaobao(match[1])
      if ((match = path.match(/\/product\/0\/(\d+)/))) return to1688(match[1])
      return urlToUse
    }

    // AC BUY
    if (host.includes('acbuy.com')) {
      const id = finalObj.searchParams.get('id') || ''
      const source = (finalObj.searchParams.get('source') || '').toUpperCase()
      if (id) {
        if (source === 'WD') return toWeidian(id)
        if (source === 'TB') return toTaobao(id)
        if (source === 'AL') return to1688(id)
      }
      return urlToUse
    }

    // CSSBUY
    if (host.includes('cssbuy.com')) {
      const path = finalObj.pathname
      let match
      if ((match = path.match(/item-micro-(\d+)/))) return toWeidian(match[1])
      if ((match = path.match(/item-1688-(\d+)/))) return to1688(match[1])
      if ((match = path.match(/item-(\d+)/))) return toTaobao(match[1])
      return urlToUse
    }

    // OOPBUY
    if (host.includes('oopbuy.com')) {
      const path = finalObj.pathname
      let match
      if ((match = path.match(/\/product\/weidian\/(\d+)/))) return toWeidian(match[1])
      if ((match = path.match(/\/product\/1\/(\d+)/))) return toTaobao(match[1])
      if ((match = path.match(/\/product\/0\/(\d+)/))) return to1688(match[1])
      return urlToUse
    }

    // ORIENTDIG
    if (host.includes('orientdig.com')) {
      const id = finalObj.searchParams.get('id') || ''
      const shopType = (finalObj.searchParams.get('shop_type') || '').toLowerCase()
      if (id) {
        if (shopType === 'weidian') return toWeidian(id)
        if (shopType === 'taobao') return toTaobao(id)
        if (shopType === 'ali_1688') return to1688(id)
      }
      return urlToUse
    }

    // MULEBUY
    if (host.includes('mulebuy.com')) {
      const id = finalObj.searchParams.get('id') || ''
      const platform = (finalObj.searchParams.get('platform') || '').toUpperCase()
      if (id) {
        if (platform.includes('WEIDIAN')) return toWeidian(id)
        if (platform.includes('TAOBAO')) return toTaobao(id)
        if (platform.includes('ALI_1688') || platform.includes('1688')) return to1688(id)
      }
      return urlToUse
    }

    // ALLCHINABUY
    if (host.includes('allchinabuy.com')) {
      const embedded = finalObj.searchParams.get('url')
      if (embedded) return decodeURIComponent(embedded)
      return urlToUse
    }

  } catch {
    // ignore mapping errors
  }

  // Generic extraction: unknown agents that embed original product URL in query params
  try {
    const obj = new URL(urlToUse)
    const isProductHost = (h: string) => (
      h.includes('taobao.com') ||
      h.includes('tmall.com') ||
      h.includes('weidian.com') ||
      h.includes('1688.com') ||
      h.includes('jd.com') ||
      h.includes('suning.com') ||
      h.includes('kaola.com') ||
      h.includes('vip.com') ||
      h.includes('dangdang.com')
    )

    // Scan all query param values for embedded URLs
    for (const [, rawVal] of Array.from(obj.searchParams.entries())) {
      const tryDecode = (v: string): string => {
        try { return decodeURIComponent(v) } catch { return v }
      }
      const candidates = [rawVal, tryDecode(rawVal), tryDecode(tryDecode(rawVal))]
      for (const cand of candidates) {
        try {
          const inner = new URL(cand)
          if (isProductHost(inner.hostname)) {
            return inner.toString()
          }
        } catch {
          // not a URL
        }
      }
    }

    // Regex scan the whole string for URLs
    const urlRegex = /(https?:\/\/[^\s<>"]+)/g
    const matches = urlToUse.match(urlRegex) || []
    for (const m of matches) {
      try {
        const u = new URL(m)
        if (isProductHost(u.hostname)) {
          return u.toString()
        }
      } catch { /* ignore */ }
    }
  } catch { /* ignore */ }

  return urlToUse
}

// Función para reintentos automáticos
async function callAPIWithRetry(goodsUrl: string): Promise<Response> {
  let attempt = 1
  
  while (true) {
    try {
      let response: Response
      
      if (PROXY_ENABLED) {
        try {
          response = await callProxyServer(goodsUrl, 'GET')
          
          if (!response.ok) {
            response = await callDirectAPI(goodsUrl, 'GET')
          }
        } catch (proxyError) {
          response = await callDirectAPI(goodsUrl, 'GET')
        }
      } else {
        response = await callDirectAPI(goodsUrl, 'GET')
      }
      
      if (response.ok) {
        return response
      }
      
      const responseText = await response.text()
      if (responseText.includes('Invalid token') || responseText.includes('token')) {
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt))
        attempt++
        continue
      }
      
      if (responseText.includes('No QC images found')) {
        return new Response(JSON.stringify({
          status: 'error',
          message: 'No QC images found'
        }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        })
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt))
      attempt++
      
    } catch (error) {
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt))
      attempt++
    }
  }
}

/**
 * Validate goods URL format
 */
function validateGoodsUrlFinal(url: string): boolean {
  if (!url || typeof url !== 'string') return false
  
  const validDomains = [
    'taobao.com',
    'tmall.com',
    '1688.com',
    'weidian.com',
    'jd.com',
    'suning.com',
    'kaola.com',
    'vip.com',
    'dangdang.com'
  ]
  
  try {
    const urlObj = new URL(url)
    return validDomains.some(domain => urlObj.hostname.includes(domain))
  } catch {
    return false
  }
}

function validateGoodsUrlInitial(url: string): boolean {
  if (!url || typeof url !== 'string') return false
  try {
    const urlObj = new URL(url)
    return urlObj.protocol === 'http:' || urlObj.protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * Call proxy server
 */
async function callProxyServer(goodsUrl: string, method: 'GET' | 'POST'): Promise<Response> {
  const proxyUrl = method === 'POST' 
    ? `${DIGITALOCEAN_SERVER}/api/qc`
    : `${DIGITALOCEAN_SERVER}/api/qc?goodsUrl=${encodeURIComponent(goodsUrl)}`

  const options: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Kakobuy-QC-API/1.0',
    }
  }

  if (method === 'POST') {
    options.body = JSON.stringify({ goodsUrl })
  }

  return fetch(proxyUrl, options)
}

/**
 * Call direct API (fallback)
 */
async function callDirectAPI(goodsUrl: string, method: 'GET' | 'POST'): Promise<Response> {
  if (method === 'POST') {
    const requestBody = {
      token: QC_TOKEN,
      goodsUrl
    }
    
    return fetch(QC_API_URL, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Kakobuy-QC-API/1.0',
      },
      body: JSON.stringify(requestBody)
    })
  } else {
    const apiUrl = new URL(QC_API_URL)
    apiUrl.searchParams.append('token', QC_TOKEN)
    apiUrl.searchParams.append('goodsUrl', goodsUrl)
    
    return fetch(apiUrl.toString(), {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Kakobuy-QC-API/1.0',
      }
    })
  }
}

/**
 * Group QC images into galleries based on time proximity
 */
function groupImagesIntoGalleries(images: QCImage[]): QCGallery[] {
  if (!images || images.length === 0) return []

  const sortedImages = [...images].sort((a, b) => {
    const dateA = new Date(a.qc_date)
    const dateB = new Date(b.qc_date)
    return dateA.getTime() - dateB.getTime()
  })

  const galleries: QCGallery[] = []
  const TIME_TOLERANCE_MINUTES = 5

  for (const image of sortedImages) {
    const imageDate = new Date(image.qc_date)
    const imageTime = imageDate.getTime()

    let addedToGallery = false
    for (const gallery of galleries) {
      const galleryDate = new Date(gallery.date)
      const galleryTime = galleryDate.getTime()
      const timeDiff = Math.abs(imageTime - galleryTime)
      const timeDiffMinutes = timeDiff / (1000 * 60)

      if (timeDiffMinutes <= TIME_TOLERANCE_MINUTES && 
          imageDate.toDateString() === galleryDate.toDateString()) {
        gallery.images.push(image)
        gallery.image_count = gallery.images.length
        addedToGallery = true
        break
      }
    }

    if (!addedToGallery) {
      const newGallery: QCGallery = {
        id: `gallery_${imageTime}`,
        images: [image],
        date: image.qc_date,
        time: imageDate.toLocaleTimeString('es-ES', { 
          hour: '2-digit', 
          minute: '2-digit',
          second: '2-digit'
        }),
        product_name: image.product_name,
        image_count: 1
      }
      galleries.push(newGallery)
    }
  }

  return galleries
}

/**
 * Create error response
 */
function createErrorResponse(message: string, status: number, errorCode?: string): NextResponse {
  return NextResponse.json(
    {
      status: 'error',
      message,
      error_code: errorCode,
      timestamp: new Date().toISOString()
    },
    { status }
  )
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { goodsUrl } = body

    if (!goodsUrl) {
      return createErrorResponse(
        ERROR_CODES.GOODS_URL_REQUIRED,
        400,
        'missing_goods_url'
      )
    }

    if (!validateGoodsUrlInitial(goodsUrl)) {
      return createErrorResponse(
        ERROR_CODES.INVALID_GOODS_URL,
        400,
        'invalid_goods_url'
      )
    }

    const actualGoodsUrl = await normalizeGoodsUrl(goodsUrl)

    if (!validateGoodsUrlFinal(actualGoodsUrl)) {
      return createErrorResponse(
        ERROR_CODES.INVALID_GOODS_URL,
        400,
        'invalid_goods_url'
      )
    }

    let response: Response
    try {
      response = await callAPIWithRetry(actualGoodsUrl)
    } catch (directError) {
      return createErrorResponse(
        'No QC images found',
        404,
        'no_images_found'
      )
    }

    const responseText = await response.text()

    if (!responseText || responseText.trim() === '') {
      return createErrorResponse('No QC images found', 404, 'no_images_found')
    }

    let data: QCAPIResponse
    try {
      data = JSON.parse(responseText)
    } catch (parseError) {
      return createErrorResponse('No QC images found', 404, 'no_images_found')
    }

    if (!data || typeof data !== 'object') {
      return createErrorResponse('No QC images found', 404, 'no_images_found')
    }

    if (data.status === 'error' && data.message && 
        (data.message.includes('Invalid token') || data.message.includes('token'))) {
      return createErrorResponse(data.message, 400, 'invalid_token')
    }

    if (!response.ok) {
      let errorMessage: string
      if (response.status === 403) {
        errorMessage = 'IP address not whitelisted. Please contact support to whitelist your IP address.'
      } else if (data && data.message) {
        errorMessage = data.message
      } else {
        errorMessage = `API Error: ${response.status} - ${response.statusText}`
      }
      return createErrorResponse(errorMessage, response.status, 'api_error')
    }
    
    if (data.status === 'error') {
      return createErrorResponse(
        data.message || ERROR_CODES.API_ERROR,
        400,
        'api_error'
      )
    }

    if (data.status !== 'success') {
      return createErrorResponse(
        'API returned unexpected response status',
        500,
        'unexpected_status'
      )
    }

    if (!Array.isArray(data.data)) {
      return createErrorResponse(
        'API returned invalid data structure',
        500,
        'invalid_data_structure'
      )
    }

    const galleries = groupImagesIntoGalleries(data.data || [])
    return NextResponse.json(
      {
        status: 'success',
        data: data.data || [],
        galleries,
        normalizedUrl: actualGoodsUrl,
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    )

  } catch (error) {
    console.error('QC API Error (POST):', error)
    return createErrorResponse(
      `${ERROR_CODES.INTERNAL_ERROR}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      500,
      'internal_server_error'
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const goodsUrl = searchParams.get('goodsUrl')

    if (!goodsUrl) {
      return createErrorResponse(
        ERROR_CODES.GOODS_URL_REQUIRED,
        400,
        'missing_goods_url'
      )
    }

    if (!validateGoodsUrlInitial(goodsUrl)) {
      return createErrorResponse(
        ERROR_CODES.INVALID_GOODS_URL,
        400,
        'invalid_goods_url'
      )
    }

    const actualGoodsUrl = await normalizeGoodsUrl(goodsUrl)

    if (!validateGoodsUrlFinal(actualGoodsUrl)) {
      return createErrorResponse(
        ERROR_CODES.INVALID_GOODS_URL,
        400,
        'invalid_goods_url'
      )
    }

    let response: Response
    try {
      response = await callAPIWithRetry(actualGoodsUrl)
    } catch (directError) {
      return createErrorResponse(
        'No QC images found',
        404,
        'no_images_found'
      )
    }

    const responseText = await response.text()

    if (!responseText || responseText.trim() === '') {
      return createErrorResponse('No QC images found', 404, 'no_images_found')
    }

    let data: QCAPIResponse
    try {
      data = JSON.parse(responseText)
    } catch (parseError) {
      return createErrorResponse('No QC images found', 404, 'no_images_found')
    }

    if (!data || typeof data !== 'object') {
      return createErrorResponse('No QC images found', 404, 'no_images_found')
    }

    if (data.status === 'error' && data.message && 
        (data.message.includes('Invalid token') || data.message.includes('token'))) {
      return createErrorResponse(data.message, 400, 'invalid_token')
    }

    if (!response.ok) {
      let errorMessage: string
      if (response.status === 403) {
        errorMessage = 'IP address not whitelisted. Please contact support to whitelist your IP address.'
      } else if (data && data.message) {
        errorMessage = data.message
      } else {
        errorMessage = `API Error: ${response.status} - ${response.statusText}`
      }
      return createErrorResponse(errorMessage, response.status, 'api_error')
    }
    
    if (data.status === 'error') {
      return createErrorResponse(
        data.message || ERROR_CODES.API_ERROR,
        400,
        'api_error'
      )
    }

    if (data.status !== 'success') {
      return createErrorResponse(
        'API returned unexpected response status',
        500,
        'unexpected_status'
      )
    }

    if (!Array.isArray(data.data)) {
      return createErrorResponse(
        'API returned invalid data structure',
        500,
        'invalid_data_structure'
      )
    }

    const galleries = groupImagesIntoGalleries(data.data || [])
    return NextResponse.json(
      {
        status: 'success',
        data: data.data || [],
        galleries,
        normalizedUrl: actualGoodsUrl,
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    )

  } catch (error) {
    console.error('QC API Error (GET):', error)
    return createErrorResponse(
      `${ERROR_CODES.INTERNAL_ERROR}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      500,
      'internal_server_error'
    )
  }
}
