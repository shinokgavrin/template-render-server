import React from 'react';
import { AbsoluteFill, Audio, Img, Sequence, Video, useCurrentFrame, useVideoConfig } from 'remotion';

type Action = {
	type: string;
	start_time: number;
	end_time: number;
	url?: string;
	max_width?: number;
};

export const SmirnoffDigest: React.FC<{
	originalVideoUrl: string;
	actions: Action[];
}> = ({ originalVideoUrl, actions }) => {
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();
	
	// Вычисляем текущее время в секундах для приглушения фонового звука
	const currentTime = frame / fps;
	
	// Проверяем, попадает ли текущее время в блок "mute" или "mute_title"
	const isMuted = actions.some(
		(a) => (a.type === 'mute_title' || a.type === 'mute') && 
		currentTime >= a.start_time && 
		currentTime <= a.end_time
	);
	
	// 🔥 СНИЖЕНО ДО 0: Абсолютная тишина, когда основной диктор отключен/переход
	const backgroundVolume = isMuted ? 0 : 1;

	return (
		<AbsoluteFill style={{ backgroundColor: 'black' }}>
			
			{/* 1. ОСНОВНОЕ ФОНОВОЕ ВИДЕО */}
			<AbsoluteFill>
				<Video src={originalVideoUrl} volume={backgroundVolume} />
			</AbsoluteFill>

			{/* 2. НАЛОЖЕНИЯ И АУДИОДОРОЖКИ */}
			{actions.map((action, index) => {
				const startFrame = Math.round(action.start_time * fps);
				const durationInFrames = Math.max(1, Math.round((action.end_time - action.start_time) * fps));

				// Рендер наложений изображений/GIF/видео
				if ((action.type === 'overlay_image' || action.type === 'overlay_gif') && action.url) {
					const isVideoAsset = action.url.toLowerCase().endsWith('.mp4') || action.url.toLowerCase().endsWith('.webm');
					
					return (
						<Sequence key={index} from={startFrame} durationInFrames={durationInFrames}>
							<AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
								{isVideoAsset ? (
									<Video 
										src={action.url} 
										style={{ 
											maxWidth: action.max_width ? `${action.max_width}px` : '1080px',
											maxHeight: '1350px',
											objectFit: 'contain',
											borderRadius: '20px',
											boxShadow: '0 20px 40px rgba(0,0,0,0.5)' 
										}} 
									/>
								) : (
									<Img 
										src={action.url} 
										style={{ 
											maxWidth: action.max_width ? `${action.max_width}px` : '1080px',
											maxHeight: '1350px',
											objectFit: 'contain',
											borderRadius: '20px',
											boxShadow: '0 20px 40px rgba(0,0,0,0.5)' 
										}} 
									/>
								)}
							</AbsoluteFill>
						</Sequence>
					);
				}

				// Рендер аудиодорожек TTS
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
