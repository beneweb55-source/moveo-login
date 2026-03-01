export const translations = {
  fr: {
    nav: {
      home: "Accueil",
      movies: "Films",
      tvShows: "Séries",
      searchPlaceholder: "Rechercher un film, une série...",
      searchResults: "Voir tous les résultats pour",
      noResults: "Aucun résultat pour",
    },
    home: {
      welcome: "Bienvenue.",
      subtitle: "Des millions de films, séries et personnes à découvrir. Explorez maintenant.",
      watchNow: "Regarder",
      moreInfo: "Plus d'infos",
      trending: "Tendances",
      whatsPopular: "Populaire",
      topRated: "Mieux Notés",
      popularMovies: "Films Populaires",
      popularTv: "Séries Populaires",
      day: "Jour",
      week: "Semaine",
      top10: "Top 10 en France",
    },
    details: {
      backHome: "Retour à l'accueil",
      season: "Saison",
      episode: "Épisode",
      seasons: "Saisons",
      videoPlayer: "Lecteur Vidéo",
      selectServer: "SÉLECTIONNER UN SERVEUR",
      currentServer: "Serveur Actuel",
      serverSlow: "Ce serveur semble lent. Essayez le serveur '2Embed' recommandé.",
      serverUnavailable: "Ce serveur est indisponible. Passage automatique au suivant...",
      allServersSlow: "Tous les serveurs semblent lents. Veuillez patienter ou réessayer plus tard.",
      tip: "💡 Conseil : Utilisez 'VOE' pour la vitesse. Pour la Version Française (VF), privilégiez '2Embed'.",
      adWarning: "Note : Les publicités proviennent des hébergeurs vidéo, nous vous conseillons fortement d'utiliser un bloqueur de publicités (comme uBlock Origin) pour une meilleure expérience.",
      noPoster: "Affiche non disponible",
    },
    explore: {
      exploreMovies: "Explorer les Films",
      exploreTv: "Explorer les Séries",
      noResults: "Désolé, aucun résultat trouvé !",
    },
    search: {
      resultsFor: "Résultats pour",
      noResults: "Aucun résultat trouvé",
      tryAnother: "Nous n'avons trouvé aucune correspondance. Essayez une autre recherche.",
    },
    footer: {
      terms: "Conditions d'utilisation",
      privacy: "Politique de confidentialité",
      about: "À propos",
      blog: "Blog",
      faq: "FAQ",
      description: "MOVEO est une plateforme de streaming premium offrant une vaste collection de films et séries. Découvrez le divertissement ultime avec notre interface ultra-moderne, des recommandations personnalisées et une lecture fluide. Rejoignez-nous et explorez le monde du cinéma comme jamais auparavant."
    }
  },
  en: {
    nav: {
      home: "Home",
      movies: "Movies",
      tvShows: "TV Shows",
      searchPlaceholder: "Search for movies, TV shows...",
      searchResults: "See all results for",
      noResults: "No results found for",
    },
    home: {
      welcome: "Welcome.",
      subtitle: "Millions of movies, TV shows and people to discover. Explore now.",
      watchNow: "Watch Now",
      moreInfo: "More Info",
      trending: "Trending",
      whatsPopular: "What's Popular",
      topRated: "Top Rated",
      popularMovies: "Popular Movies",
      popularTv: "Popular TV Shows",
      day: "Day",
      week: "Week",
      top10: "Top 10 in France",
    },
    details: {
      backHome: "Back to Home",
      season: "Season",
      episode: "Episode",
      seasons: "Seasons",
      videoPlayer: "Video Player",
      selectServer: "SELECT A SERVER",
      currentServer: "Current Server",
      serverSlow: "This server seems slow. Try the recommended '2Embed' server.",
      serverUnavailable: "This server is unavailable. Automatically switching to the next one...",
      allServersSlow: "All servers seem slow. Please wait or try again later.",
      tip: "💡 Tip: Use 'VOE' for speed. For French Version (VF), prefer '2Embed'.",
      adWarning: "Note: Ads come from video hosts, we strongly advise using an ad blocker (like uBlock Origin) for a better experience.",
      noPoster: "Poster unavailable",
    },
    explore: {
      exploreMovies: "Explore Movies",
      exploreTv: "Explore TV Shows",
      noResults: "Sorry, no results found!",
    },
    search: {
      resultsFor: "Results for",
      noResults: "No results found",
      tryAnother: "We couldn't find any matches. Try another search.",
    },
    footer: {
      terms: "Terms Of Use",
      privacy: "Privacy-Policy",
      about: "About",
      blog: "Blog",
      faq: "FAQ",
      description: "MOVEO is a premium streaming platform offering a vast collection of movies and TV shows. Experience the ultimate entertainment with our ultra-modern interface, personalized recommendations, and seamless playback. Join us and explore the world of cinema like never before."
    }
  }
};

export type Language = "fr" | "en";
export type Translations = typeof translations.fr;
