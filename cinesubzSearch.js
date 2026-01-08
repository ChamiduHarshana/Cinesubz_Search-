import * as cheerio from "https://esm.sh/cheerio@1.0.0-rc.12";

// ==========================================
// CONFIGURATION (xCHAMi Studio)
// ==========================================
const CONFIG = {
  BASE_URL: "https://cinesubz.lk",
  USER_AGENT: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  DEFAULT_IMG: "https://via.placeholder.com/300x450?text=xCHAMi+Movie+Hub"
};

// ==========================================
// 1. SMART HELPER: FETCH HTML (Auto Retry)
// ==========================================
async function fetchHTML(url) {
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": CONFIG.USER_AGENT, "Referer": "https://www.google.com/" }
    });
    if (!response.ok) throw new Error("Connection Failed");
    return await response.text();
  } catch (e) {
    console.error(`Error fetching ${url}:`, e.message);
    return null;
  }
}

// ==========================================
// 2. CAPTION GENERATOR (Photo Style)
// ==========================================
function generateCaption(data) {
  // ඔයා එවපු ෆොටෝ එකේ තියෙන විදිහටම Emojis සහ Format එක
  return `
☘️ 𝗧𝗜𝗧𝗟𝗘 ☛ ${data.title} (${data.year})

⏹️ 📅 𝗥𝗘𝗟𝗘𝗔𝗦𝗘 𝗗𝗔𝗧𝗘 ☛ ${data.release_date || 'N/A'}
⏹️ 🌍 𝗖𝗢𝗨𝗡𝗧𝗥𝗬 ☛ ${data.country || 'N/A'}
⏹️ ⏱️ 𝗗𝗨𝗥𝗔𝗧𝗜𝗢𝗡 ☛ ${data.duration || 'N/A'}
⏹️ 🎭 𝗚𝗘𝗡𝗥𝗘𝗦 ☛ ${data.genres || 'N/A'}

⏹️ 👨🏻‍💼 𝗗𝗜𝗥𝗘𝗖𝗧𝗢𝗥 ☛ ${data.director || 'N/A'}
⏹️ 🕵️ 𝗖𝗔𝗦𝗧 ☛ ${data.cast || 'See inside for details'}

🔗 𝗗𝗼𝘄𝗻𝗹𝗼𝗮𝗱: ${data.link}
  `.trim();
}

// ==========================================
// 3. CORE: DATA EXTRACTOR
// ==========================================
async function extractMovieData(link, type = "Movie") {
  const html = await fetchHTML(link);
  if (!html) return { error: "Failed to load" };

  const $ = cheerio.load(html);
  
  // -- Smart Text Finder (Labels හොයලා ඒවා ඉස්සරහා තියෙන දේ ගන්නවා) --
  const findInfo = (keywords) => {
    let result = "N/A";
    $('strong, b, span').each((i, el) => {
      const txt = $(el).text().toLowerCase();
      // Keyword එක මැච් වෙනවද බලනවා (director, country, etc.)
      if (keywords.some(k => txt.includes(k))) {
        // Label එක අයින් කරලා පිරිසිදු කරනවා
        let clean = $(el).parent().text()
          .replace($(el).text(), '') // Label එක මකනවා
          .replace(':', '').replace('-', '').trim(); 
        if (clean.length > 1) result = clean;
      }
    });
    return result;
  };

  // 1. Basic Info
  const rawTitle = $('h1.entry-title').text().trim() || "Unknown Title";
  const yearMatch = rawTitle.match(/\((20\d{2})\)/);
  const year = yearMatch ? yearMatch[1] : "N/A";

  // 2. High Quality Image
  let img = $('.entry-content img').first().attr('src') || $('.post-thumbnail img').attr('src');
  if (img) img = img.replace(/-\d+x\d+(?=\.(jpg|jpeg|png))/i, ''); // Remove size suffix

  // 3. Detailed Info (The "Auto Fix" logic looks for multiple keywords)
  const details = {
    title: rawTitle.replace(/\(\d{4}\)/, '').trim(),
    year: year,
    type: type,
    release_date: findInfo(['date', 'release', 'air']),
    country: findInfo(['country', 'nation']),
    duration: findInfo(['time', 'duration', 'runtime']),
    genres: findInfo(['genre', 'category']),
    director: findInfo(['director', 'directed']),
    cast: findInfo(['cast', 'actor', 'starring']),
    link: link,
    image: img || CONFIG.DEFAULT_IMG
  };

  // 4. Generate the Caption Style
  details.whatsapp_caption = generateCaption(details);

  return details;
}

// ==========================================
// MAIN SERVER
// ==========================================
Deno.serve(async (req) => {
  const url = new URL(req.url);
  const cors = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };

  // =========================================================
  // ROUTE 1: SEARCH (?q=Iron Man) OR LATEST (No query)
  // =========================================================
  if (url.pathname === "/search" || url.pathname === "/") {
    const q = url.searchParams.get("q");
    
    // Search එකක් නැත්නම්, අපි Home Page එක Scrape කරමු (Latest Movies)
    const targetUrl = q 
      ? `${CONFIG.BASE_URL}/?s=${encodeURIComponent(q)}` 
      : CONFIG.BASE_URL; // Home Page

    try {
      console.log(`Fetching: ${targetUrl}`);
      const html = await fetchHTML(targetUrl);
      if (!html) throw new Error("Site Unreachable");

      const $ = cheerio.load(html);
      const items = [];

      // Article කාඩ් ටික එකතු කරගන්නවා
      $('article').each((i, el) => {
        if (items.length >= 8) return false; // Max 8 items

        const link = $(el).find('a').first().attr('href');
        const title = $(el).find('.entry-title, h2').text().trim();
        const img = $(el).find('img').attr('src');
        
        let type = "Movie";
        if(link.includes('tvshows') || link.includes('series')) type = "TV Series";

        if (link && title) {
          items.push({ link, title, type, temp_img: img });
        }
      });

      // හැම එකේම ඇතුලට ගිහින් විස්තර ගන්නවා (Parallel)
      const fullData = await Promise.all(items.map(async (item) => {
        try {
          return await extractMovieData(item.link, item.type);
        } catch (e) {
          return { title: item.title, error: "Data extraction failed" };
        }
      }));

      return new Response(JSON.stringify({
        status: "success",
        mode: q ? "Search Mode" : "Latest Releases", // Search ද Latest ද කියලා කියනවා
        count: fullData.length,
        results: fullData
      }, null, 2), { headers: cors });

    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { headers: cors });
    }
  }

  return new Response(JSON.stringify({ msg: "API Online. Use /search?q=name" }), { headers: cors });
});
