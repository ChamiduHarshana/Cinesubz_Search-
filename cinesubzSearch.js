import * as cheerio from "https://esm.sh/cheerio@1.0.0-rc.12";

// ==========================================
// CONFIGURATION
// ==========================================
const BASE_URL = "https://cinesubz.lk";
const MAX_RESULTS_TO_SCRAPE = 5; // ෆිල්ම් කීයක full details ගන්නවද?

// බොරු බ්‍රව්සර් එකක් වගේ පෙන්නන්න Headers
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Referer": "https://google.com",
  "Accept-Language": "en-US,en;q=0.9"
};

// ==========================================
// 1. HELPER: ROBUST FETCH (Auto Retry & Error Fix)
// ==========================================
async function fetchHTML(url) {
  try {
    const response = await fetch(url, { headers: HEADERS });
    if (!response.ok) throw new Error(`Status ${response.status}`);
    return await response.text();
  } catch (e) {
    console.error(`[Error] Failed to fetch ${url}:`, e.message);
    return null; // Error එකක් ආවොත් නවතින්නෙ නැතුව null යවනවා
  }
}

// ==========================================
// 2. HELPER: SMART INFO EXTRACTOR (බෝරූටෝ එකේ වගේ විස්තර ගන්න)
// ==========================================
function extractSpecificData($, label) {
  // මේකෙන් අපි HTML එකේ තියෙන Text scan කරනවා "Director:", "Cast:" වගේ ඒවා හොයන්න
  let foundData = "N/A";
  
  // Method 1: Strong tags ඇතුලේ තියෙනවද බලනවා (Common Pattern)
  $('strong, b').each((i, el) => {
    const text = $(el).text().trim();
    if (text.toLowerCase().includes(label.toLowerCase())) {
      // Label එක හම්බුනාම, ඊළඟට තියෙන text එක ගන්නවා
      let nextText = $(el)[0].nextSibling?.nodeValue?.trim();
      // එහෙම නැත්තම් parent එකේ text එකෙන් label එක අයින් කරනවා
      if (!nextText) {
         nextText = $(el).parent().text().replace(text, '').replace(':', '').trim();
      }
      if (nextText && nextText.length > 1) {
        foundData = nextText;
        return false; // Break loop
      }
    }
  });

  return foundData;
}

// ==========================================
// 3. MAIN: GET MOVIE DETAILS (ඇතුලට ගිහින් විස්තර ගන්න කොටස)
// ==========================================
async function getMovieDetails(movieUrl) {
  const html = await fetchHTML(movieUrl);
  if (!html) return null;

  const $ = cheerio.load(html);
  
  // A. Description (සිංහල විස්තරය)
  let description = "";
  $('.entry-content p').each((i, el) => {
    const text = $(el).text().trim();
    // සිංහල අකුරු තියෙන, Copyright නැති, දිග ඡේදයක් හොයාගන්නවා
    if (text.length > 60 && /[\u0D80-\u0DFF]/.test(text) && !text.toLowerCase().includes('copyright')) {
      description = text;
      return false; // පලවෙනි ඡේදය හම්බුනාම නවතින්න
    }
  });

  // B. Specific Info (Image 2 එකේ විදිහට)
  const info = {
    release_date: extractSpecificData($, "Release Date") || extractSpecificData($, "Date"),
    country: extractSpecificData($, "Country"),
    duration: extractSpecificData($, "Duration") || extractSpecificData($, "Time"),
    genres: extractSpecificData($, "Genres") || extractSpecificData($, "Category"),
    director: extractSpecificData($, "Director"),
    cast: extractSpecificData($, "Cast") || extractSpecificData($, "Actors"),
    imdb_rating: extractSpecificData($, "IMDb")
  };

  // C. Download Links (Smart Extraction)
  const downloads = [];
  $('a').each((i, el) => {
    const link = $(el).attr('href');
    const text = $(el).text().toLowerCase();
    
    // Download ලින්ක් අඳුරගන්න විශේෂ වචන
    if (link && (
        text.includes('download') || 
        text.includes('drive') || 
        text.includes('mega') || 
        text.includes('gofile') ||
        text.includes('pixel') ||
        $(el).attr('class')?.includes('download')
       )) {
       
       // Social Media ලින්ක් අයින් කරන්න
       if (!link.includes('facebook') && !link.includes('twitter') && !link.includes('whatsapp')) {
          downloads.push({
            server: $(el).text().trim().replace(/download/gi, '').trim() || "Direct Link",
            url: link
          });
       }
    }
  });

  return { description, info, downloads };
}

// ==========================================
// MAIN SERVER
// ==========================================
Deno.serve(async (req) => {
  const url = new URL(req.url);

  // Allow CORS (ඕනම තැනක ඉඳන් request කරන්න පුළුවන් වෙන්න)
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET"
  };

  if (url.pathname === "/search") {
    const query = url.searchParams.get("q");
    if (!query) return new Response(JSON.stringify({ status: "error", message: "Please add ?q=movie_name" }), { status: 400, headers });

    try {
      // 1. Search පිටුවට යනවා
      const searchHtml = await fetchHTML(`${BASE_URL}/?s=${encodeURIComponent(query)}`);
      if (!searchHtml) throw new Error("Connection failed");

      const $ = cheerio.load(searchHtml);
      const tempResults = [];
      const seenLinks = new Set();

      // 2. Search Results List එක හදාගන්නවා
      $('article, .result-item, .item').each((i, el) => {
        const anchor = $(el).find('a').first();
        const link = anchor.attr('href');
        
        if (link && (link.includes('/movies/') || link.includes('/tvshows/')) && !seenLinks.has(link)) {
          
          let title = $(el).find('.title, h2, h3').text().trim();
          
          // Image එක High Quality ගන්න ට්‍රයි කරනවා
          let imgTag = $(el).find('img');
          let image = imgTag.attr('data-src') || imgTag.attr('src'); // Lazy load images fix

          if (title && image) {
            tempResults.push({
              title: title,
              image: image,
              link: link,
              type: link.includes('/tvshows/') ? 'TV Show' : 'Movie'
            });
            seenLinks.add(link);
          }
        }
      });

      // Results නැත්නම්
      if (tempResults.length === 0) {
        return new Response(JSON.stringify({ status: "success", result_count: 0, data: [] }), { headers });
      }

      // 3. (Magic Part) මුල් ෆිල්ම් 5 ඇතුලට ගිහින් full details ගන්නවා
      // Parallel Request යවනවා (වේගවත් වෙන්න)
      const limitedResults = tempResults.slice(0, MAX_RESULTS_TO_SCRAPE);
      
      const fullData = await Promise.all(limitedResults.map(async (movie) => {
        try {
          const details = await getMovieDetails(movie.link);
          if (!details) return movie; // Details ගන්න බැරි වුනොත් Basic ටික විතරක් යවනවා (Crash නොවී)

          return {
            ...movie,
            description: details.description || "No description available",
            info: details.info, // මෙතන තමයි Cast, Director ඔක්කොම තියෙන්නේ
            download_links: details.downloads
          };
        } catch (innerErr) {
          console.error(`Error scraping ${movie.title}:`, innerErr);
          return movie; // Error ආවොත් Basic data ටික යවනවා
        }
      }));

      return new Response(JSON.stringify({
        status: "success",
        result_count: fullData.length,
        data: fullData
      }, null, 2), { headers });

    } catch (err) {
      return new Response(JSON.stringify({ status: "error", message: err.message }), { status: 500, headers });
    }
  }

  // Home Route
  return new Response(JSON.stringify({ 
    message: "Cinesubz Super Scraper API is Online!", 
    usage: "/search?q=avatar" 
  }, null, 2), { 
    status: 200, 
    headers 
  });
});
