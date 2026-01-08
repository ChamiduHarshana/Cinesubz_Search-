import * as cheerio from "https://esm.sh/cheerio@1.0.0-rc.12";

Deno.serve(async (req) => {
  const url = new URL(req.url);
  
  // Search API (/search?q=movie_name)
  if (url.pathname === "/search") {
    const query = url.searchParams.get("q");

    // 1. නම දීලා නැත්නම් Error එකක්
    if (!query) {
      return new Response(
        JSON.stringify({
          status: 'error',
          message: 'Please provide a movie name using ?q=movie_name',
          channel: '@xCHAMi_Studio'
        }, null, 2),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    try {
      console.log(`Searching for: ${query}`);
      const searchUrl = `https://cinesubz.co/?s=${encodeURIComponent(query)}`;
      
      // 2. ශක්තිමත් Headers භාවිතා කිරීම (Cloudflare මග හැරීමට)
      const response = await fetch(searchUrl, {
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          "Referer": "https://cinesubz.co/",
          "Upgrade-Insecure-Requests": "1",
          "Sec-Ch-Ua": '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
          "Sec-Ch-Ua-Mobile": "?0",
          "Sec-Ch-Ua-Platform": '"Windows"'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch Cinesubz: ${response.status} ${response.statusText}`);
      }

      const html = await response.text();
      const $ = cheerio.load(html);
      const results = [];

      // 3. Selectors කීපයක් ට්‍රයි කිරීම (Site එකේ design වෙනස් වුනත් අල්ලගන්න)
      // Cinesubz එකේ සාමාන්‍යයෙන් තියෙන්නේ 'article', '.result-item', හෝ '.item'
      const movieElements = $('article, .result-item, .item, .post');

      movieElements.each((index, element) => {
        // Title එක හොයන විවිධ ක්‍රම
        let titleElement = $(element).find('h2 a');
        if (titleElement.length === 0) titleElement = $(element).find('h3 a');
        if (titleElement.length === 0) titleElement = $(element).find('.title a');

        const title = titleElement.text().trim();
        const link = titleElement.attr('href');
        
        // Image එක හොයන විවිධ ක්‍රම
        let image = $(element).find('img').attr('src');
        if (!image) image = $(element).find('img').attr('data-src'); // Lazy load images

        // Extra details
        const rating = $(element).find('.imdb, .rating').text().trim() || "N/A";
        const year = $(element).find('.year, .metadata').text().trim() || "N/A";

        if (title && link) {
          results.push({
            title,
            image: image || null,
            link,
            rating,
            year,
            source: "Cinesubz"
          });
        }
      });

      // 4. Results තියෙනවා නම් යවන්න
      if (results.length > 0) {
        return new Response(
          JSON.stringify({
            status: 'success',
            total_results: results.length,
            data: results,
            channel: '@xCHAMi_Studio'
          }, null, 2),
          { 
            headers: { 
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*" 
            } 
          }
        );
      } else {
        // 5. Results නැත්නම්: Debug Info එවන්න
        // මෙතනින් බලාගන්න පුළුවන් Cloudflare එකෙන් Block කරලද කියලා
        const titleTag = $('title').text();
        const bodyPreview = $('body').text().substring(0, 300).replace(/\s+/g, ' ').trim();

        return new Response(
          JSON.stringify({
            status: 'error',
            message: 'No movies found.',
            debug_info: {
                page_title: titleTag,
                page_content_preview: bodyPreview // මේක බලන්න "Just a moment..." කියල තියෙනවද කියල
            },
            channel: '@xCHAMi_Studio'
          }, null, 2),
          { status: 404, headers: { "Content-Type": "application/json" } }
        );
      }

    } catch (error) {
      return new Response(
        JSON.stringify({
          status: 'error',
          message: error.message,
          channel: '@xCHAMi_Studio'
        }, null, 2),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
  }

  return new Response("Cinesubz Deno API Updated! Use /search?q=movie_name", { status: 200 });
});
