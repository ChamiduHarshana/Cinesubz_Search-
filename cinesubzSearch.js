import * as cheerio from "https://esm.sh/cheerio@1.0.0-rc.12";

const CONFIG = {
  BASE_URL: "https://cinesubz.lk",
  USER_AGENT: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0 Safari/537.36",
  DEFAULT_IMG: "https://via.placeholder.com/300x450?text=No+Image"
};

// ==========================================
// 1. HELPER: FETCH HTML
// ==========================================
async function fetchHTML(url) {
  try {
    const response = await fetch(url, { headers: { "User-Agent": CONFIG.USER_AGENT } });
    if (!response.ok) return null;
    return await response.text();
  } catch (e) { return null; }
}

// ==========================================
// 2. CAPTION MAKER (ඔයාගේ Photo එකේ විදිහටම)
// ==========================================
function generateCaption(data) {
  return `
☘️ 𝗧𝗜𝗧𝗟𝗘 ☛ ${data.title} (${data.year})

⏹️ 📅 𝗥𝗘𝗟𝗘𝗔𝗦𝗘 𝗗𝗔𝗧𝗘 ☛ ${data.release_date || 'N/A'}
⏹️ 🌍 𝗖𝗢𝗨𝗡𝗧𝗥𝗬 ☛ ${data.country || 'N/A'}
⏹️ ⏱️ 𝗗𝗨𝗥𝗔𝗧𝗜𝗢𝗡 ☛ ${data.duration || 'N/A'}
⏹️ 🎭 𝗚𝗘𝗡𝗥𝗘𝗦 ☛ ${data.genres || 'N/A'}

⏹️ 👨🏻‍💼 𝗗𝗜𝗥𝗘𝗖𝗧𝗢𝗥 ☛ ${data.director || 'N/A'}
⏹️ 🕵️ 𝗖𝗔𝗦𝗧 ☛ ${data.cast || 'N/A'}

🔗 𝗗𝗼𝘄𝗻𝗹𝗼𝗮𝗱: ${data.link}
`.trim();
}

// ==========================================
// 3. DATA EXTRACTOR (Details අදින මැෂින් එක)
// ==========================================
async function extractMovieData(link) {
  const html = await fetchHTML(link);
  if (!html) return null;
  const $ = cheerio.load(html);

  // Helper to find text by label
  const findInfo = (keys) => {
    let res = "N/A";
    $('strong, b, span').each((i, el) => {
      const t = $(el).text().toLowerCase();
      if (keys.some(k => t.includes(k))) {
        res = $(el).parent().text().replace($(el).text(), '').replace(/[:|-]/g, '').trim();
      }
    });
    return res;
  };

  const titleRaw = $('h1.entry-title').text().trim();
  const year = (titleRaw.match(/\((20\d{2})\)/) || ["", "N/A"])[1];
  
  // HD Image Fix
  let img = $('.entry-content img').first().attr('src') || $('meta[property="og:image"]').attr('content');
  if (img) img = img.replace(/-\d+x\d+\./, '.'); // Resize කෑලි අයින් කිරීම

  const details = {
    title: titleRaw.replace(/\(.*\)/, '').trim(),
    year: year,
    release_date: findInfo(['date', 'release']),
    country: findInfo(['country']),
    duration: findInfo(['time', 'duration']),
    genres: findInfo(['genre']),
    director: findInfo(['director']),
    cast: findInfo(['cast', 'starring']),
    link: link,
    image: img || CONFIG.DEFAULT_IMG
  };
  
  details.whatsapp_caption = generateCaption(details);
  return details;
}

// ==========================================
// MAIN SERVER (FIXED SEARCH LOGIC)
// ==========================================
Deno.serve(async (req) => {
  const url = new URL(req.url);
  const q = url.searchParams.get("q"); // Search Query එක ගන්නවා

  const headers = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };

  // 1. Search නමක් දීලා නැත්නම් Error එකක් යවනවා (Home Page එක යවන්නේ නෑ)
  if (url.pathname === "/search" && !q) {
    return new Response(JSON.stringify({ error: "Please add ?q=MovieName to the URL" }), { headers });
  }

  // 2. Link එක තීරණය කිරීම
  let targetUrl = CONFIG.BASE_URL;
  if (q) {
    console.log("Searching for:", q); // Log එකේ පෙන්නනවා
    targetUrl = `${CONFIG.BASE_URL}/?s=${encodeURIComponent(q)}`;
  }

  try {
    const html = await fetchHTML(targetUrl);
    if (!html) throw new Error("Connection Failed");
    const $ = cheerio.load(html);
    
    let links = [];
    
    // Result පෙන්නන කොටු (Articles) ටික හොයාගැනීම
    $('article').each((i, el) => {
      if (links.length >= 5) return; // 5ක් ඇති
      const a = $(el).find('a').first();
      if (a.attr('href')) links.push(a.attr('href'));
    });

    // Results මුකුත් නැත්නම්
    if (links.length === 0) {
      return new Response(JSON.stringify({ 
        status: "failed", 
        message: `No results found for '${q}'` 
      }), { headers });
    }

    // විස්තර ටික ගන්නවා
    const fullData = await Promise.all(links.map(url => extractMovieData(url)));

    // JSON Output
    return new Response(JSON.stringify({
      status: "success",
      search_query: q || "Latest Movies",
      results: fullData.filter(d => d) // හිස් ඒවා අයින් කරනවා
    }, null, 2), { headers });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { headers });
  }
});
