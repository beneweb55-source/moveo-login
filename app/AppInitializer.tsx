"use client";

import { useEffect } from "react";
import { useDispatch } from "react-redux";
import { fetchDataFromApi } from "@/utils/api";
import { getApiConfiguration, getGenres } from "@/store/homeSlice";

export default function AppInitializer({ children }: { children: React.ReactNode }) {
  const dispatch = useDispatch();

  useEffect(() => {
    const fetchApiConfig = () => {
      fetchDataFromApi("/configuration").then((res) => {
        const url = {
          backdrop: res.images.secure_base_url + "original",
          poster: res.images.secure_base_url + "original",
          profile: res.images.secure_base_url + "original",
        };
        dispatch(getApiConfiguration(url));
      });
    };

    const genresCall = async () => {
      let promises: any[] = [];
      let endPoints = ["tv", "movie"];
      let allGenres: any = {};

      endPoints.forEach((url) => {
        promises.push(fetchDataFromApi(`/genre/${url}/list`));
      });

      const data = await Promise.all(promises);
      data.map(({ genres }) => {
        return genres.map((item: any) => (allGenres[item.id] = item));
      });

      dispatch(getGenres(allGenres));
    };

    fetchApiConfig();
    genresCall();
  }, [dispatch]);

  return <>{children}</>;
}
