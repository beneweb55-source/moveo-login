"use client";

import { useState, useEffect } from "react";
import { fetchDataFromApi } from "@/utils/api";
import ContentWrapper from "@/components/ContentWrapper";
import SwitchTabs from "@/components/SwitchTabs";
import Carousel from "@/components/Carousel";
import { useLanguage } from "@/context/LanguageContext";

const Popular = () => {
  const [endpoint, setEndpoint] = useState("movie");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const { language, t } = useLanguage();

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const langParam = language === 'fr' ? 'fr-FR' : 'en-US';
      const res = await fetchDataFromApi(`/${endpoint}/popular`, { language: langParam });
      setData(res);
      setLoading(false);
    };
    fetchData();
  }, [endpoint, language]);

  const onTabChange = (tab: string, index: number) => {
    setEndpoint(index === 0 ? "movie" : "tv");
  };

  return (
    <div className="relative mb-12">
      <ContentWrapper>
        <div className="flex items-center justify-between mb-5">
          <span className="text-2xl text-white font-bold">{t.home.whatsPopular}</span>
          <SwitchTabs data={[t.nav.movies, t.nav.tvShows]} onTabChange={onTabChange} />
        </div>
        <Carousel data={data?.results} loading={loading} endpoint={endpoint} />
      </ContentWrapper>
    </div>
  );
};

export default Popular;
