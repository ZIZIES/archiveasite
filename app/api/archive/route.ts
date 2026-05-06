import { NextRequest, NextResponse } from 'next/server';
import * as cheerio from 'cheerio';

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json();

    if (!url) {
      return NextResponse.json({ error: 'no url provided' }, { status: 400 });
    }

    // fetch the webpage
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    if (!response.ok) {
      return NextResponse.json({ error: 'failed to fetch page' }, { status: 500 });
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    const baseUrl = new URL(url);

    // inline all CSS
    const styleSheets = $('link[rel="stylesheet"]');
    for (const sheet of styleSheets.toArray()) {
      const href = $(sheet).attr('href');
      if (!href) continue;

      try {
        const cssUrl = new URL(href, baseUrl).href;
        const cssResponse = await fetch(cssUrl);
        const cssText = await cssResponse.text();
        
        // replace link with inline style
        $(sheet).replaceWith(`<style>${cssText}</style>`);
      } catch (err) {
        console.error('failed to fetch css:', href);
      }
    }

    // inline all images as base64
    const images = $('img');
    for (const img of images.toArray()) {
      const src = $(img).attr('src');
      if (!src || src.startsWith('data:')) continue;

      try {
        const imgUrl = new URL(src, baseUrl).href;
        const imgResponse = await fetch(imgUrl);
        const buffer = await imgResponse.arrayBuffer();
        const base64 = Buffer.from(buffer).toString('base64');
        const contentType = imgResponse.headers.get('content-type') || 'image/png';
        
        $(img).attr('src', `data:${contentType};base64,${base64}`);
      } catch (err) {
        console.error('failed to fetch image:', src);
      }
    }

    // inline background images in style attributes
    const elementsWithStyle = $('[style*="url("]');
    for (const el of elementsWithStyle.toArray()) {
      const style = $(el).attr('style');
      if (!style) continue;

      const urlMatches = style.match(/url\(['"]?([^'")\s]+)['"]?\)/g);
      if (!urlMatches) continue;

      let newStyle = style;
      for (const match of urlMatches) {
        const urlMatch = match.match(/url\(['"]?([^'")\s]+)['"]?\)/);
        if (!urlMatch) continue;

        const imgSrc = urlMatch[1];
        try {
          const imgUrl = new URL(imgSrc, baseUrl).href;
          const imgResponse = await fetch(imgUrl);
          const buffer = await imgResponse.arrayBuffer();
          const base64 = Buffer.from(buffer).toString('base64');
          const contentType = imgResponse.headers.get('content-type') || 'image/png';
          
          newStyle = newStyle.replace(imgSrc, `data:${contentType};base64,${base64}`);
        } catch (err) {
          console.error('failed to fetch bg image:', imgSrc);
        }
      }
      $(el).attr('style', newStyle);
    }

    const finalHtml = $.html();

    return new NextResponse(finalHtml, {
      headers: {
        'Content-Type': 'text/html',
        'Content-Disposition': 'attachment; filename="archived-site.html"',
      },
    });
  } catch (error) {
    console.error('archive error:', error);
    return NextResponse.json({ error: 'something broke' }, { status: 500 });
  }
}
