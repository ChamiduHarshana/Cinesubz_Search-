import * as cheerio from "https://esm.sh/cheerio@1.0.0-rc.12";

// ==========================================
// CONFIGURATION
// ==========================================
const BASE_URL = "https://cinesubz.lk";
const MAX_RESULTS = 5; // උපරිම ෆිල්ම් කීයක විස්තර ඕනද?

// Browser එකක් විදිහට වෙබ් අඩවිය රැවටීම සඳහා Headers
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Referer": "https://www.google.com/",
  "Connection": "keep-alive"
};

// ==========================================
// 1. HELPER: FETCH HTML (Auto Retry Included)
// ==========================================
async function fetchHTML(url) {
  try {
    const response = await fetch(url, { headers: HEADERS });
    if (!response.ok) throw new Error(`Status ${response.status}`);
    return await response.text();
  } catch (e) {
    console.error(`Error fetching ${url}:`, e.message);
    return null;
  }
}

// ==========================================
// 2. HELPER: EXTRACT DETAILS (Smart Scanner)
// ==========================================
async function getFullDetails(link) {
  const html = await fetchHTML(link);
  if (!html) return {};
  const $ = cheerio.load(html);

  // 1. Description (Sinhalata)
  let description = "";
  // P tags ඔක්කොම බලනවා, සිංහල අකුරු තියෙන දිගම එක ගන්නවා
  $('p').each((i, el) => {
    const t = $(el).text().trim();
    if (t.length > 50 && /[\u0D80-\u0DFF]/.test(t) && !t.includes('Copyright')) {
      description = t;
    }
  });

  // 2. Info Box (Director, Cast, etc.)
  const info = {};
  
  // Smart Helper function to find text based on label
  const findInfo = (keyword) => {
    let result = "N/A";
    $('strong, b, span').each((i, el) => {
      if ($(el).text().toLowerCase().includes(keyword.toLowerCase())) {
        // Label එක අයින් කරලා ඉතුරු ටික ගන්නවා
        let val = $(el).parent().text().replace($(el).text(), '').replace(':', '').replace('-', '').trim();
        if(val.length > 1) result = val;
      }
    });
    return result;
  };

  info.release_date = findInfo('Date') || findInfo('Release');
  info.country = findInfo('Country');
  info.imdb_rating = findInfo('IMDb');
  info.director = findInfo('Director');
  info.cast = findInfo('Cast') || findInfo('Actors') || findInfo('Starring');
  info.duration = findInfo('Time') || findInfo('Duration');

  // 3. Download Links (Auto Filter)
  const downloads = [];
  $('a').each((i, el) => {
    const href = $(el).attr('href');
    const txt = $(el).text().toLowerCase();
    
    // Download Keywords
    if (href && (txt.includes('download') || txt.includes('drive') || txt.includes('mega') || txt.includes('gofile') || $(el).attr('class')?.includes('download'))) {
      // Social Media අයින් කරනවා
      if (!href.includes('facebook') && !href.includes('twitter') && !href.includes('whatsapp') && !href.includes('#')) {
        downloads.push({
          server: $(el).text().replace(/download/gi, '').trim() || "Direct Link",
          url: href
        });
      }
    }
  });

  return { description, info, download_links: downloads };
}

// ==========================================
// MAIN SERVER CODE
// ==========================================
Deno.serve(async (req) => {
  const url = new URL(req.url);
  
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*"
  };

  if (url.pathname === "/search") {
    const q = url.searchParams.get("q");
    if (!q) return new Response(JSON.stringify({ error: "Please add ?q=movie_name" }), { headers });

    try {
      console.log(`Searching for: ${q}`);
      const searchUrl = `${BASE_URL}/?s=${encodeURIComponent(q)}`;
      const html = await fetchHTML(searchUrl);
      
      if (!html) return new Response(JSON.stringify({ error: "Site connection failed" }), { headers });

      const $ = cheerio.load(html);
      let results = [];
      let seen = new Set();

      // ==================================================
      // STRATEGY 1: Standard Search (Normal Way)
      // ==================================================
      $('article').each((i, el) => {
        const a = $(el).find('a').first();
        const link = a.attr('href');
        const title = $(el).find('.entry-title, .title, h2').text().trim();
        const img = $(el).find('img').attr('src');

        if (link && title && !seen.has(link)) {
          results.push({ title, link, image: img, type: "Standard" });
          seen.add(link);
        }
      });

      // ==================================================
      // STRATEGY 2: Brute Force (If Strategy 1 Fails)
      // ==================================================
      if (results.length === 0) {
        console.log("Standard search failed. Trying Brute Force...");
        $('a').each((i, el) => {
          const link = $(el).attr('href');
          
          // Link එකේ /movies/ හෝ /tvshows/ තියෙනවද බලනවා
          if (link && (link.includes('/movies/') || link.includes('/tvshows/')) && !seen.has(link)) {
            
            // Link එක ඇතුලේ තියෙන Image එක හොයනවා
            let img = $(el).find('img').attr('src') || $(el).find('img').attr('data-src');
            // Title එක Link එකේ text එකෙන් හෝ title attribute එකෙන් ගන්නවා
            let title = $(el).attr('title') || $(el).text().trim();

            if (title.length > 2) {
              results.push({
                title: title,
                link: link,
                image: img || "https://via.placeholder.com/150", // Image නැත්නම් බොරු එකක්
                type: link.includes('tvshows') ? "TV Show" : "Movie"
              });
              seen.add(link);
            }
          }
        });
      }

      // තාමත් 0 නම්, මොකක් හරි ලොකු අවුලක්
      if (results.length === 0) {
        return new Response(JSON.stringify({ 
          status: "failed", 
          message: "No results found. Site might be blocking bots or structure changed.",
          debug_url: searchUrl
        }), { headers });
      }

      // ==================================================
      // GET FULL DETAILS (Parallel Processing)
      // ==================================================
      const limitedResults = results.slice(0, MAX_RESULTS);
      
      const fullData = await Promise.all(limitedResults.map(async (item) => {
        try {
          const details = await getFullDetails(item.link);
          return { ...item, ...details };
        } catch (err) {
          // Error එකක් ආවොත්, මූලික විස්තර ටික යවනවා (Crash නොවී)
          return { ...item, error: "Details fetch failed" };
        }
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

  return new Response(JSON.stringify({ msg: "API Working! Use /search?q=avatar" }), { headers });
});
