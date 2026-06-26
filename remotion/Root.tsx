import React from "react";
import { Composition } from "remotion";
import { getVideoMetadata } from "@remotion/media-utils";
import { SmirnoffDigest } from "./SmirnoffDigest";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="SmirnoffDigest"
        component={SmirnoffDigest}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{
          originalVideoUrl: "https://pub-9133209d2ae746859bab1bf8500330d4.r2.dev/Smirsa_1080p.mp4",
          actions: [],
        }}
        // 🔥 ДИНАМИЧЕСКИЙ РАСЧЕТ ДЛИНЫ ВИДЕО 🔥
        calculateMetadata={async ({ props }) => {
          if (!props.originalVideoUrl) {
            return { durationInFrames: 30000, props };
          }
          
          try {
            // Движок сам переходит по ссылке и читает метаданные (длину) видео
            const metadata = await getVideoMetadata(props.originalVideoUrl);
            
            return {
              // Устанавливаем таймлайн ровно кадр-в-кадр с оригинальным видео
              // (продолжительность в секундах умножаем на 30 кадров в секунду)
              durationInFrames: Math.ceil(metadata.durationInSeconds * 30),
              props,
            };
          } catch (err) {
            console.error("Failed to fetch video metadata, using fallback duration", err);
            return { durationInFrames: 30000, props };
          }
        }}
      />
    </>
  );
};
