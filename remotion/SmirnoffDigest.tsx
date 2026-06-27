import React, { useEffect, useState } from 'react';
import { AbsoluteFill, Audio, Img, Sequence, OffthreadVideo, Video, Loop, useCurrentFrame, useVideoConfig } from 'remotion';

const remotionModule = (() => {
	try { return require('remotion'); } 
	catch (e) { return { delayRender: () => 'mock-handle', continueRender: () => {} }; }
})();
const { delayRender, continueRender } = remotionModule;

const mediaUtilsModule = (() => {
	try { return require('@remotion/media-utils'); } 
	catch (e) { return { getVideoMetadata: async () => ({ durationInSeconds: 2 }) }; }
})();
const { getVideoMetadata } = mediaUtilsModule;

type Action = {
	type: string;
	start_time: number;
	end_time: number;
	url?: string;
	max_width?: number;
	max_height?: number;
};

// Умный компонент зацикливания мелких реакций (без утечек памяти)
const LoopingReaction: React.FC<{ src: string; style: React.CSSProperties }> = ({ src, style }) => {
	const { fps } = useVideoConfig();
	const [handle] = useState(() => delayRender(`Fetching metadata for ${src}`));
	const [naturalDuration, setNaturalDuration] = useState<number | null>(null);

	useEffect(() => {
		getVideoMetadata(src)
			.then((meta: any) => {
				const frames = Math.max(1, Math.round(meta.durationInSeconds * fps));
				setNaturalDuration(frames);
				continueRender(handle);
			})
			.catch((err: any) => {
				console.warn("Could not get metadata for reaction, using fallback", err);
				setNaturalDuration(Math.round(fps * 2));
				continueRender(handle);
			});
	}, [src, fps, handle]);

	if (naturalDuration === null) {
		return null;
	}

	return (
		<Loop durationInFrames={naturalDuration}>
			<OffthreadVideo src={src} style={style} crossOrigin="anonymous" />
		</Loop>
	);
};

export const SmirnoffDigest: React.FC<{
	originalVideoUrl: string;
	actions: Action[];
}> = ({ originalVideoUrl, actions }) => {
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();
	
	if (!originalVideoUrl) {
		return (
			<AbsoluteFill style={{ backgroundColor: '#7f1d1d', justifyContent: 'center', alignItems: 'center' }}>
				<h1 style={{ color: 'white', fontFamily: 'sans-serif', fontSize: '40px' }}>
					⚠️ ОШИБКА РЕНДЕРА: originalVideoUrl пуст!
				</h1>
			</AbsoluteFill>
		);
	}

	const currentTime = frame / fps;
	
	const isMuted = actions?.some(
		(a) => (a.type === 'mute_title' || a.type === 'mute') && 
		currentTime >= a.start_time && 
		currentTime <= a.end_time
	) ?? false;

	return (
		<AbsoluteFill style={{ backgroundColor: 'black' }}>
			
			{/* === 1. ОСНОВНОЕ ВИДЕО === */}
			{/* Поскольку файл теперь скачан на диск сервера, используем OffthreadVideo. 
			    Он обеспечит 100% покадровую точность через FFMPEG без "тряски" и рывков! */}
			<AbsoluteFill>
				<OffthreadVideo 
					src={originalVideoUrl} 
					muted={true} 
					style={{ width: '100%', height: '100%', objectFit: 'contain' }}
					crossOrigin="anonymous" 
				/>
			</AbsoluteFill>

			{/* === 2. ОРИГИНАЛЬНЫЙ ЗВУК === */}
			<Audio src={originalVideoUrl} volume={isMuted ? 0 : 1} />

			{/* === 3. НАЛОЖЕНИЯ И АУДИОДОРОЖКИ === */}
			{actions?.map((action, index) => {
				const startFrame = Math.round(action.start_time * fps);
				const durationInFrames = Math.max(1, Math.round((action.end_time - action.start_time) * fps));

				if ((action.type === 'overlay_image' || action.type === 'overlay_gif') && action.url) {
					const isVideoAsset = action.url.toLowerCase().endsWith('.mp4') || action.url.toLowerCase().endsWith('.webm');
					
					return (
						<Sequence key={index} from={startFrame} durationInFrames={durationInFrames}>
							<AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', pointerEvents: 'none' }}>
								{isVideoAsset ? (
									<LoopingReaction 
										src={action.url} 
										style={{ 
											maxWidth: action.max_width || 1080,
											maxHeight: action.max_height || 1350,
											objectFit: 'contain',
											borderRadius: '20px',
											boxShadow: '0 20px 40px rgba(0,0,0,0.6)' 
										}}
									/>
								) : (
									<Img 
										src={action.url} 
										style={{ 
											maxWidth: action.max_width || 1080,
											maxHeight: action.max_height || 1350,
											objectFit: 'contain',
											borderRadius: '20px',
											boxShadow: '0 20px 40px rgba(0,0,0,0.6)' 
										}}
										crossOrigin="anonymous"
									/>
								)}
							</AbsoluteFill>
						</Sequence>
					);
				}

				if (action.type === 'mute_title' && action.url) {
					return (
						<Sequence key={index} from={startFrame} durationInFrames={durationInFrames}>
							<Audio src={action.url} volume={1} />
						</Sequence>
					);
				}

				return null;
			})}
		</AbsoluteFill>
	);
};
