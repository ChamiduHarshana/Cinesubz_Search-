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
      // 1. Cinesubz එකට Request යැවීම (ශක්තිමත් Headers සමග)
      const searchUrl = `https://cinesubz.co/?s=${encodeURIComponent(query)}`;
      
      const response = await fetch(searchUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        }
      });

      const html = await response.text();
      const $ = cheerio.load(html);
      const results = [];
      const uniqueLinks = new Set(); // එකම ෆිල්ම් එක දෙපාරක් වැටෙන එක වලක්වන්න

      // 2. අලුත් ක්‍රමය: "Universal Scraper" Logic
      // අපි විශේෂ නම් (Classes) හොයන්නේ නෑ. අපි හොයන්නේ "Link එකක් ඇතුලේ තියෙන පින්තූර" විතරයි.
      $('a').each((index, element) => {
        const link = $(element).attr('href');
        const imgTag = $(element).find('img');
        
        // Link එකක් සහ Image එකක් තියෙනවා නම් විතරක් ගන්න
        if (link && imgTag.length > 0) {
          
          // Image එක ගන්න (src හෝ data-src හෝ srcset)
          let image = imgTag.attr('src');
          if (!image || image.includes('base64')) image = imgTag.attr('data-src');
          
          // Title එක ගන්න (Image එකේ alt එකෙන් හෝ Link එකේ title එකෙන්)
          let title = imgTag.attr('alt') || $(element).attr('title') || $(element).text().trim();

          // පෙරහන (Filter): මේක ඇත්තටම Movie එකක්ද කියලා බලන්න
          // 1. Link එකේ "movies" හෝ "tvshows" කෑල්ල තියෙන්න ඕනේ.
          // 2. නැත්නම්, Title එකේ අපි Search කරපු වචනේ තියෙන්න ඕනේ.
          const isMovieLink = link.includes('/movies/') || link.includes('/tvshows/') || link.includes('/episodes/');
          const isRelevantTitle = title && title.toLowerCase().includes(query.toLowerCase());

          // නරක Results අයින් කිරීම (Logos, User icons වගේ දේවල්)
          if ((isMovieLink || isRelevantTitle) && !uniqueLinks.has(link) && title.length > 2) {
            
            // අවුරුද්ද (Year) සහ Rating හොයන්න පොඩි ට්‍රයි එකක්
            // (මේවා නැති වුනාට කමක් නෑ, Title/Link/Image තමයි වැදගත්)
            const parent = $(element).closest('div, article, li');
            const year = parent.text().match(/\d{4}/)?.[0] || "N/A"; 
            const rating = parent.find('.imdb, .rating, .score').text().trim() || "N/A";

            results.push({
              title: title,
              image: image || "No Image",
              link: link,
              rating: rating,
              year: year,
              source: "Cinesubz"
            });
            
            uniqueLinks.add(link); // මේ Link එක ආයේ ගන්න එපා
          }
        }
      });

      // 3. ප්‍රතිඵල යැවීම
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
        // තාම වැඩ නැත්නම් විතරක් මේක එනවා
        return new Response(
          JSON.stringify({
            status: 'error',
            message: 'No movies found.',
            debug_info: {
                page_title: $('title').text(),
                // HTML එකේ පලවෙනි Link 5 අපිට පෙන්නන්න (Debug කරන්න ලේසි වෙන්න)
                first_links: $('a').slice(0, 5).map((i, el) => $(el).attr('href')).get()
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

  return new Response("API Updated v3! Use /search?q=movie_name", { status: 200 });
});
