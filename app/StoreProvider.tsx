"use client";

import { Provider } from "react-redux";
import { store } from "@/store/store";
import AppInitializer from "./AppInitializer";

export default function StoreProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Provider store={store}>
      <AppInitializer>{children}</AppInitializer>
    </Provider>
  );
}
