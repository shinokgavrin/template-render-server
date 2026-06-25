import React from "react";
import { Composition } from "remotion";
import { SmirnoffDigest } from "./SmirnoffDigest";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="SmirnoffDigest"
        component={SmirnoffDigest}
        durationInFrames={30000} // This dynamically overrides during render based on the actual video length
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{
          originalVideoUrl: "https://dl.dropboxusercontent.com/s/sample-fallback-video.mp4",
          actions: [],
        }}
      />
    </>
  );
};
