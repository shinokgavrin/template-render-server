import React from "react";
import { Composition } from "remotion";
import { SmirnoffDigest } from "./SmirnoffDigest";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="SmirnoffDigest"
        component={SmirnoffDigest}
        durationInFrames={30000}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{
          originalVideoUrl: "https://pub-9133209d2ae746859bab1bf8500330d4.r2.dev/Smirsa_1080p.mp4",
          actions: [],
        }}
      />
    </>
  );
};
