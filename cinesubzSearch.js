import * as cheerio from "https://esm.sh/cheerio@1.0.0-rc.12";

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // Search API
  if (url.pathname === "/search") {
    const query = url.searchParams.get("q");

    if (!query) {
      return new Response(
        JSON.stringify({ status: 'error', message: 'Add ?q=movie_name' }, null, 2),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    try {
      // 1. Cinesubz.lk (අලුත් ඩොමේන් එක) වෙත Request යැවීම
      const searchUrl = `https://cinesubz.lk/?s=${encodeURIComponent(query)}`;
      
      const response = await fetch(searchUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        }
      });

      const html = await response.text();
      const $ = cheerio.load(html);
      const results = [];

      // 2. අලුත් Selector Logic එක (Cinesubz.lk සඳහා)
      // Cinesubz LK එකේ චිත්‍රපට පෙන්නන්නේ "article" හෝ "div" ඇතුලේ class="result-item" වගේ නමකින්.
      // අපි පොදු ක්‍රමයක් (Generic Method) පාවිච්චි කරමු.

      $('article, .item, .result-item, .post').each((index, element) => {
        // Title එක ගන්න
        const titleTag = $(element).find('h2 a, h3 a, .title a');
        const title = titleTag.text().trim();
        const link = titleTag.attr('href');
        
        // Image එක ගන්න (Lazy load images අල්ලගන්න)
        let image = $(element).find('img').attr('src');
        if (!image || image.includes('base64')) {
            image = $(element).find('img').attr('data-src');
        }

        // විස්තර (IMDB, Year)
        const rating = $(element).find('.rating, .imdb').text().trim() || "N/A";
        const year = $(element).find('.year, .meta-date').text().trim() || "N/A";

        // Download Link එක ගැන විශේෂ සටහනක්:
        // Search Result එකේ කෙලින්ම Download Button එක නෑ. තියෙන්නේ ෆිල්ම් එකේ Page එකට Link එක.
        // ඒ Link එකට ගියාම තමයි Download කරන්න පුළුවන්. 
        // අපි මෙතන ඒ Link එක "movie_url" ලෙස දෙනවා.

        if (title && link) {
          results.push({
            title: title,
            image: image || "https://via.placeholder.com/150", // Image එකක් නැත්නම් බොරු එකක් දාන්න
            imdb_rating: rating,
            year: year,
            movie_url: link, // මේකට ගිහින් තමයි Download කරන්න ඕනේ
            status: "Found"
          });
        }
      });

      // 3. Results යැවීම
      if (results.length > 0) {
        return new Response(
          JSON.stringify({
            status: 'success',
            total_results: results.length,
            data: results,
            channel: '@xCHAMi_Studio'
          }, null, 2),
          { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
        );
      } else {
        // Debug Info (වැඩ කරන්නේ නැත්නම් හේතුව හොයාගන්න)
        return new Response(
          JSON.stringify({
            status: 'error',
            message: 'Movies not found. Check debug info.',
            debug_info: {
                target_site: "cinesubz.lk",
                page_title: $('title').text(),
                // අහු උන HTML කෑලි ටිකක් බලමු
                found_articles: $('article').length,
                found_items: $('.item').length,
                found_posts: $('.post').length
            },
            channel: '@xCHAMi_Studio'
          }, null, 2),
          { status: 404, headers: { "Content-Type": "application/json" } }
        );
      }

    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }, null, 2), { status: 500 });
    }
  }

  return new Response("Cinesubz API (LK Version) is Running!", { status: 200 });
});
