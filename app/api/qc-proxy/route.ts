import { NextRequest, NextResponse } from 'next/server'

// DigitalOcean server URL (your whitelisted IP)
const DIGITALOCEAN_SERVER = 'http://174.138.36.254:3000'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { goodsUrl } = body

    if (!goodsUrl) {
      return NextResponse.json(
        { status: 'error', message: 'Goods URL is required' },
        { status: 400 }
      )
    }

    console.log('Vercel Proxy Request (POST):', { goodsUrl })

    // Forward request to DigitalOcean server
    const response = await fetch(`${DIGITALOCEAN_SERVER}/api/qc`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Kakobuy-QC-Proxy/1.0',
      },
      body: JSON.stringify({ goodsUrl })
    })

    const responseText = await response.text()
    console.log('DigitalOcean Response:', responseText)

    let data
    try {
      data = JSON.parse(responseText)
    } catch (parseError) {
      return NextResponse.json(
        { status: 'error', message: 'Invalid response from proxy server' },
        { status: 500 }
      )
    }

    return NextResponse.json(data, { status: response.status })

  } catch (error) {
    console.error('Vercel Proxy Error:', error)
    return NextResponse.json(
      { 
        status: 'error', 
        message: 'Proxy server error. Please ensure DigitalOcean server is running.',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const goodsUrl = searchParams.get('goodsUrl')

    if (!goodsUrl) {
      return NextResponse.json(
        { status: 'error', message: 'Goods URL is required' },
        { status: 400 }
      )
    }

    console.log('Vercel Proxy Request (GET):', { goodsUrl })

    // Forward request to DigitalOcean server
    const apiUrl = new URL(`${DIGITALOCEAN_SERVER}/api/qc`)
    apiUrl.searchParams.append('goodsUrl', goodsUrl)

    const response = await fetch(apiUrl.toString(), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'Kakobuy-QC-Proxy/1.0',
      }
    })

    const responseText = await response.text()
    console.log('DigitalOcean Response:', responseText)

    let data
    try {
      data = JSON.parse(responseText)
    } catch (parseError) {
      return NextResponse.json(
        { status: 'error', message: 'Invalid response from proxy server' },
        { status: 500 }
      )
    }

    return NextResponse.json(data, { status: response.status })

  } catch (error) {
    console.error('Vercel Proxy Error:', error)
    return NextResponse.json(
      { 
        status: 'error', 
        message: 'Proxy server error. Please ensure DigitalOcean server is running.',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
