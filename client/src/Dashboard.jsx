import React, { useState, useEffect } from "react";
import { Container, Form } from "react-bootstrap";
import axios from "axios";

import useAuth from "./useAuth.jsx";
import TrackSearchResults from "./TrackSearchResults.jsx";
import Player from "./Player.jsx";
import SpotifyWebApi from "spotify-web-api-node";
import Top from "./Top.jsx";

const spotifyApi = new SpotifyWebApi({
  clientId: "501daf7d1dfb43a291ccc64c91c8a4c8",
});

export default function Dashboard({ code }) {
  const accessToken = useAuth(code);
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [playingTrack, setPlayingTrack] = useState();
  const [lyrics, setLyrics] = useState("");
  const [topArtists, setTopArtists] = useState([]);
  const [topTracks, setTopTracks] = useState([]);

  function chooseTrack(track) {
    setPlayingTrack(track);
    setSearch("");
    setLyrics("");
  }

  useEffect(() => {
    if (!playingTrack) return;

    axios
      .get("http://localhost:3001/lyrics", {
        params: {
          track: playingTrack.title,
          artists: playingTrack.artists,
        },
      })
      .then((res) => {
        setLyrics(res.data.lyrics);
      });
  }, [playingTrack]);

  useEffect(() => {
    if (!accessToken) return;
    spotifyApi.setAccessToken(accessToken);
  }, [accessToken]);

  useEffect(() => {
    if (!search) return setSearchResults([]);
    if (!accessToken) return;

    let cancel = false; // if a new request is made then we want to cancel the original request
    spotifyApi.searchTracks(search).then((res) => {
      if (cancel) return;
      setSearchResults(
        res.body.tracks.items.map((track) => {
          const smallestAlbumImage = track.album.images.reduce(
            (smallest, image) => {
              if (image.height < smallest.height) return image;
              return smallest;
            },
            track.album.images[0]
          );
          return {
            artist: track.artists[0].name,
            title: track.name,
            uri: track.uri,
            albumUrl: smallestAlbumImage.url,
          };
        })
      );
    });

    return () => (cancel = true);
  }, [search, accessToken]);

  // need to update the scope to get top
  useEffect(() => {
    if (!accessToken) return;
    spotifyApi.getMyTopArtists().then((data) => {
      // console.log(data.body.items);
      setTopArtists(
        data.body.items.map((artist) => {
          return {
            name: artist.name,
          };
        })
      );
    });

    spotifyApi.getMyTopTracks({ time_range: "short_term" }).then((data) => {
      // console.log(data.body.items);
      setTopTracks(
        data.body.items.map((track) => {
          const smallestAlbumImage = track.album.images.reduce(
            (smallest, image) => {
              if (image.height < smallest.height) return image;
              return smallest;
            },
            track.album.images[0]
          );
          let artists_string = "";
          track.artists.forEach((artist, index) => {
            if (index + 1 == track.artists.length) {
              return (artists_string += `${artist.name}`);
            } else {
              return (artists_string += `${artist.name}, `);
            }
          });

          return {
            artist: artists_string,
            name: track.name,
            uri: track.uri,

            albumUrl: smallestAlbumImage.url,
          };
        })
      );
    });
  }, [accessToken]);

  console.log(topTracks);

  return (
    <Container className="d-flex flex-column py-2" style={{ height: "100vh" }}>
      <Form.Control
        type="search"
        placeholder="Search Songs/Artists"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div className="flex-grow-1 my-2" style={{ overflowY: "auto" }}>
        {searchResults.map((track) => (
          <TrackSearchResults
            track={track}
            key={track.uri}
            chooseTrack={chooseTrack}
          />
        ))}
        {searchResults.length === 0 && (
          <div className="text-center" style={{ whiteSpace: "pre" }}>
            {lyrics}
          </div>
        )}
      </div>
      {/* {topArtists.length > 0 ? (
        <div className="text-center" style={{ whiteSpace: "pre" }}>
          {topArtists.map((artist) => {
            return <div>{artist.name}</div>;
          })}
        </div>
      ) : null} */}
      {topTracks.length > 0 ? (
        <div className="text-center" style={{ whiteSpace: "pre" }}>
          {topTracks.map((track) => {
            return (
              <Top
                track={track}
                name={track.name}
                artist={track.artist}
                albumUrl={track.albumUrl}
                chooseTrack={chooseTrack}
              />
            );
          })}
        </div>
      ) : null}

      <div>
        <Player accessToken={accessToken} trackUri={playingTrack?.uri} />
      </div>
    </Container>
  );
}
