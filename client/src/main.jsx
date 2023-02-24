import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";

import App from "./App";
import Search from "./pages/Search.jsx";
import TopTrack from "./pages/TopTrack.jsx";
import TopArtist from "./pages/TopArtist.jsx";

const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    children: [
      {
        path: "search",
        element: <Search />,
      },
      {
        path: "top-artists",
        element: <TopArtist />,
      },
      {
        path: "top-tracks",
        element: <TopTrack />,
      },
    ],
  },
]);

ReactDOM.createRoot(document.getElementById("root")).render(
  <RouterProvider router={router} />
);
