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
// 2. HELPER: CAPTION GENERATOR (User Requested Style)
// ==========================================
function generateCaption(data) {
  return `
☘️ 𝗧𝗜𝗧𝗟𝗘 ☛ ${data.title}
${data.release_date ? `\n⏹️ 📅 𝗥𝗘𝗟𝗘𝗔𝗦𝗘 𝗗𝗔𝗧𝗘 ☛ ${data.release_date}` : ''}
${data.country ? `\n⏹️ 🌍 𝗖𝗢𝗨𝗡𝗧𝗥𝗬 ☛ ${data.country}` : ''}
${data.duration ? `\n⏹️ ⏱️ 𝗗𝗨𝗥𝗔𝗧𝗜𝗢𝗡 ☛ ${data.duration}` : ''}
${data.genres ? `\n⏹️ 🎭 𝗚𝗘𝗡𝗥𝗘𝗦 ☛ ${data.genres}` : ''}

${data.director ? `⏹️ 👨🏻‍💼 𝗗𝗜𝗥𝗘𝗖𝗧𝗢𝗥 ☛ ${data.director}` : ''}
${data.cast ? `\n⏹️ 🕵️ 𝗖𝗔𝗦𝗧 ☛ ${data.cast}` : ''}

🔗 𝗗𝗼𝘄𝗻𝗹𝗼𝗮𝗱: ${data.link}
`.trim();
}

// ==========================================
// 3. HELPER: EXTRACT DETAILS (Smart Scanner)
// ==========================================
async function getFullDetails(link) {
  const html = await fetchHTML(link);
  if (!html) return {};
  const $ = cheerio.load(html);

  // Basic Details
  const rawTitle = $('h1.entry-title').text().trim() || $('title').text().split('|')[0].trim();
  
  // Smart Helper to find text based on label
  const findInfo = (keyword) => {
    let result = null;
    $('strong, b, span').each((i, el) => {
      if ($(el).text().toLowerCase().includes(keyword.toLowerCase())) {
        let val = $(el).parent().text().replace($(el).text(), '').replace(/[:|-]/g, '').trim();
        if(val.length > 1) result = val;
      }
    });
    return result;
  };

  const details = {
    title: rawTitle,
    release_date: findInfo('Date') || findInfo('Release'),
    country: findInfo('Country'),
    director: findInfo('Director'),
    cast: findInfo('Cast') || findInfo('Actors'),
    duration: findInfo('Time') || findInfo('Duration'),
    genres: findInfo('Genre') || findInfo('Category'),
    link: link,
    // HD Image Fix
    image: ($('.entry-content img').first().attr('src') || "").replace(/-\d+x\d+(?=\.)/, '') 
  };

  // Generate Caption
  details.whatsapp_caption = generateCaption(details);
  return details;
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

        if (link && title && !seen.has(link)) {
          results.push({ title, link });
          seen.add(link);
        }
      });

      // ==================================================
      // STRATEGY 2: Brute Force (Link Scanner) - වැදගත්ම කොටස
      // ==================================================
      if (results.length === 0) {
        console.log("Standard search failed. Trying Brute Force...");
        $('a').each((i, el) => {
          const link = $(el).attr('href');
          // Link එකේ /movies/ හෝ /tvshows/ තියෙනවද බලනවා
          if (link && (link.includes('/movies/') || link.includes('/tvshows/')) && !seen.has(link)) {
            
            // Link එක ඇතුලේ තියෙන Image එකෙන් හරි Title එක ගන්නවා
            let title = $(el).attr('title') || $(el).text().trim();
            
            if (title.length > 2) {
              results.push({ title, link });
              seen.add(link);
            }
          }
        });
      }

      // තාමත් 0 නම්, ඇත්තටම ෆිල්ම් එක නෑ
      if (results.length === 0) {
        return new Response(JSON.stringify({ 
          status: "failed", 
          message: `No results found for '${q}'. Try a different name.`,
        }), { headers });
      }

      // ==================================================
      // GET FULL DETAILS (Parallel Processing)
      // ==================================================
      // අපි මුල් Results 5 විතරක් ගන්නවා වේගය වැඩි කරන්න
      const limitedResults = results.slice(0, MAX_RESULTS);
      
      const fullData = await Promise.all(limitedResults.map(async (item) => {
        try {
          return await getFullDetails(item.link);
        } catch (err) {
          return { title: item.title, error: "Details fetch failed" };
        }
      }));

      return new Response(JSON.stringify({
        status: "success",
        query: q,
        count: fullData.length,
        results: fullData
      }, null, 2), { headers });

    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { status: 500, headers });
    }
  }

  return new Response(JSON.stringify({ msg: "API Working! Use /search?q=deadpool" }), { headers });
});
