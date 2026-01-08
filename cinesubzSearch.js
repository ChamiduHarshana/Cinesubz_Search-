import * as cheerio from "https://esm.sh/cheerio@1.0.0-rc.12";

// Configuration
const BASE_URL = "https://cinesubz.lk";
const MAX_RESULTS_TO_SCRAPE = 5; // එකපාර ෆිල්ම් කීයක විස්තර ගන්නවද? (වැඩි කළොත් Slow වෙයි)

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Referer": "https://google.com"
};

// ==========================================
// 1. Helper: HTML ගෙන්වා ගැනීම (Fetch)
// ==========================================
async function fetchHTML(url) {
  try {
    const response = await fetch(url, { headers: HEADERS });
    if (!response.ok) throw new Error(`Status ${response.status}`);
    return await response.text();
  } catch (e) {
    console.error(`Failed to fetch ${url}:`, e.message);
    return null;
  }
}

// ==========================================
// 2. Helper: ෆිල්ම් එකක් ඇතුලට ගිහින් විස්තර ගැනිම
// ==========================================
async function getMovieDetails(movieUrl) {
  const html = await fetchHTML(movieUrl);
  if (!html) return { description: "Failed to load", downloads: [] };

  const $ = cheerio.load(html);
  
  // විස්තරය (Description) සොයාගැනීම
  let description = "";
  $('p').each((i, el) => {
    const text = $(el).text().trim();
    if (text.length > 50 && /[\u0D80-\u0DFF]/.test(text) && !text.includes('Copyright')) {
      description = text;
      return false; // Loop එක නවත්වනවා
    }
  });

  // Download Links සොයාගැනීම
  const downloads = [];
  $('a').each((i, el) => {
    const link = $(el).attr('href');
    const text = $(el).text().toLowerCase();
    
    if (link && (text.includes('download') || text.includes('drive') || text.includes('mega') || $(el).attr('class')?.includes('download'))) {
       if (!link.includes('facebook') && !link.includes('twitter')) {
          downloads.push({
            server: $(el).text().trim() || "Direct Link",
            url: link
          });
       }
    }
  });

  // Info (IMDB etc.)
  const info = {};
  $('.entry-content strong, .entry-content b').each((i, el) => {
      const key = $(el).text().replace(':', '').trim();
      const value = $(el).parent().text().replace(key, '').replace(':', '').trim();
      if(key && value) info[key] = value;
  });

  return { description, downloads, info };
}

// ==========================================
// MAIN API SERVER
// ==========================================
Deno.serve(async (req) => {
  const url = new URL(req.url);

  // CORS Headers
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*"
  };

  // Route: /search?q=avatar
  if (url.pathname === "/search") {
    const query = url.searchParams.get("q");
    if (!query) return new Response(JSON.stringify({ error: "Add ?q=name" }), { status: 400, headers });

    try {
      // පියවර 1: Search Result පිටුවට යාම
      const searchHtml = await fetchHTML(`${BASE_URL}/?s=${encodeURIComponent(query)}`);
      if (!searchHtml) return new Response(JSON.stringify({ error: "Cinesubz connection failed" }), { status: 500, headers });

      const $ = cheerio.load(searchHtml);
      const tempResults = [];
      const seenLinks = new Set();

      // පියවර 2: මූලික ෆිල්ම් ලිස්ට් එක ගැනීම
      $('a').each((i, el) => {
        const link = $(el).attr('href');
        if (link && (link.includes('/movies/') || link.includes('/tvshows/')) && !seenLinks.has(link)) {
          
          let title = $(el).find('.title, h2, h3').text().trim() || $(el).text().trim();
          
          // Image එක ගැනිම
          let imgTag = $(el).find('img');
          if (imgTag.length === 0) imgTag = $(el).closest('div').find('img');
          let image = imgTag.attr('src');
          if (!image || image.includes('base64')) image = imgTag.attr('data-src');

          if (title && image && title.length > 2) {
            tempResults.push({
              title: title.replace(/\n/g, '').trim(),
              image: image,
              link: link,
              type: link.includes('/tvshows/') ? 'TV Show' : 'Movie'
            });
            seenLinks.add(link);
          }
        }
      });

      // පියවර 3: (Advanced Step) මුල් ෆිල්ම් 5 ඇතුලට ගිහින් විස්තරත් අරගන්න!
      // Promise.all පාවිච්චි කරලා අපි එක පාර පිටු 5 කට යනවා (Parallel Scraping)
      
      const limitedResults = tempResults.slice(0, MAX_RESULTS_TO_SCRAPE);
      
      const fullData = await Promise.all(limitedResults.map(async (movie) => {
        // මේ ෆිල්ම් එකේ ඇතුලට ගිහින් විස්තර ගේන්න
        const details = await getMovieDetails(movie.link);
        
        // පරණ Data + අලුත් Details එකතු කිරීම
        return {
          ...movie, // Title, Image, Link
          description: details.description, // Story
          info: details.info, // IMDB, Year
          download_links: details.downloads // Download Buttons!
        };
      }));

      return new Response(JSON.stringify({
        status: "success",
        result_count: fullData.length,
        data: fullData
      }, null, 2), { headers });

    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { status: 500, headers });
    }
  }

  return new Response("Super Cinesubz API Running! Use /search?q=avatar", { status: 200 });
});
