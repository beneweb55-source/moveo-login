import axios from "axios";

const BASE_URL = "/api/tmdb-proxy";

export const fetchDataFromApi = async (url: string, params?: any) => {
  try {
    const { data } = await axios.get(BASE_URL, {
      params: {
        endpoint: url,
        ...params,
      },
    });
    return data;
  } catch (err) {
    console.log(err);
    return err;
  }
};
