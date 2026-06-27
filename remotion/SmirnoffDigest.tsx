import React, { useEffect, useState } from 'react';
import { 
	AbsoluteFill, 
	Audio, 
	Img, 
	Sequence, 
	Video, 
	OffthreadVideo, 
	Loop, 
	useCurrentFrame, 
	useVideoConfig,
	delayRender,
	continueRender
} from 'remotion';
import { getVideoMetadata } from '@remotion/media-utils';

type Action = {
	type: string;
	start_time: number;
	end_time: number;
	url?: string;
	max_width?: number;
	max_height?: number;
};

// --- СТАБИЛЬНЫЕ РЕАКЦИИ С ТАЙМАУТОМ ---
// Извлекает точную длину реакции. Если метаданные не скачались за 5 секунд — луп не зависает!
const LoopingReaction: React.FC<{ src: string; style: React.CSSProperties }> = ({ src, style }) => {
	const { fps } = useVideoConfig();
	const [handle] = useState(() => delayRender(`Fetching metadata for ${src}`));
	const [naturalDuration, setNaturalDuration] = useState<number | null>(null);

	useEffect(() => {
		// Предохранитель: принудительный старт через 5 секунд, если сеть тормозит
		const timeout = setTimeout(() => {
			console.warn(`Metadata timeout for ${src}, using 5s fallback`);
			setNaturalDuration(Math.round(fps * 5));
			continueRender(handle);
		}, 5000);

		getVideoMetadata(src)
			.then((meta) => {
				clearTimeout(timeout);
				const duration = Math.max(1, Math.round(meta.durationInSeconds * fps));
				setNaturalDuration(duration);
				continueRender(handle);
			})
			.catch((err) => {
				clearTimeout(timeout);
				console.warn("Could not get metadata for reaction", err);
				setNaturalDuration(Math.round(fps * 5));
				continueRender(handle);
			});
	}, [src, fps, handle]);

	if (naturalDuration === null) return null;

	return (
		<Loop durationInFrames={naturalDuration}>
			{/* OffthreadVideo гарантирует железобетонный луп без пропуска кадров на сервере */}
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
				<h1 style={{ color: 'white', fontFamily: 'sans-serif', fontSize: '32px' }}>⚠️ ОШИБКА: Missing video URL</h1>
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
			
			{/* === 1. ГЛАВНОЕ ВИДЕО (Точный старт) === */}
			<AbsoluteFill>
				<Video 
					src={originalVideoUrl} 
					muted={true} 
					startFrom={0}      // Форсирует чтение с первого кадра (фикс 10-секундного фриза)
					playbackRate={1}   // Стабилизирует тайминг
					style={{ width: '100%', height: '100%', objectFit: 'contain' }}
					crossOrigin="anonymous" 
				/>
			</AbsoluteFill>

			{/* === 2. ГИБКОЕ АУДИО === */}
			<Audio src={originalVideoUrl} volume={isMuted ? 0 : 1} />

			{/* === 3. ОВЕРЛЕИ И РЕАКЦИИ === */}
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
