import * as cheerio from "https://esm.sh/cheerio@1.0.0-rc.12";

// Deno Server එක පටන් ගැනීම (Deno Deploy වලදී මෙය ස්වයංක්‍රීයව හඳුනාගනී)
Deno.serve(async (req) => {
  const url = new URL(req.url);
  
  // Route 1: Search API (/search?q=movie_name)
  if (url.pathname === "/search") {
    const query = url.searchParams.get("q");

    // 1. Validation: නමක් දීලා නැත්නම් Error එකක්
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
      // 2. Cinesubz එකට බොරු User-Agent එකක් එක්ක Request යැවීම
      // (Deno වල native 'fetch' එක පාවිච්චි කරනවා - Axios ඕන නෑ)
      const searchUrl = `https://cinesubz.co/?s=${encodeURIComponent(query)}`;
      
      const response = await fetch(searchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch Cinesubz: ${response.statusText}`);
      }

      const html = await response.text();
      
      // 3. Cheerio දාලා HTML එක කියවීම
      const $ = cheerio.load(html);
      const results = [];

      // 4. Data Scrape කිරීම (Structure එක Cinesubz අනුව)
      $('article').each((index, element) => {
        const titleElement = $(element).find('h2 a, h3 a');
        const title = titleElement.text().trim();
        const link = titleElement.attr('href');
        const image = $(element).find('img').attr('src');
        const rating = $(element).find('.imdb').text().trim() || "N/A";
        const year = $(element).find('.year').text().trim() || "N/A";

        if (title && link) {
          results.push({
            title,
            image,
            link,
            rating,
            year,
            source: "Cinesubz"
          });
        }
      });

      // 5. ප්‍රතිඵලය JSON ලෙස යැවීම
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
              "Access-Control-Allow-Origin": "*" // ඕනෑම තැනක ඉඳන් Access කරන්න පුළුවන්
            } 
          }
        );
      } else {
        return new Response(
          JSON.stringify({
            status: 'error',
            message: 'No movies found.',
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

  // Home Page (Just a placeholder)
  return new Response("Cinesubz Deno API is Running! Use /search?q=name", { status: 200 });
});
