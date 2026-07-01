import React from 'react';
import { 
	AbsoluteFill, 
	Audio, 
	Img, 
	Sequence, 
	Video, 
	Loop, 
	useCurrentFrame, 
	useVideoConfig,
	interpolate
} from 'remotion';

type Action = {
	type: string;
	start_time: number;
	end_time: number;
	url?: string;
	max_width?: number;
	max_height?: number;
};

// Функция плавного и точного микширования звука диктора
const getCurrentVolume = (frame: number, fps: number, actions: Action[]) => {
	let volume = 1;
	if (!actions) return volume;

	for (const action of actions) {
		if (action.type === 'mute' || action.type === 'mute_title') {
			const startFrame = Math.round(action.start_time * fps);
			const endFrame = Math.round(action.end_time * fps);
			
			// Плавное затухание за 5 кадров до и плавное возвращение звука после
			if (frame >= startFrame - 5 && frame <= endFrame + 5) {
				const fadeOut = interpolate(frame, [startFrame - 5, startFrame], [1, 0], { 
					extrapolateLeft: 'clamp', 
					extrapolateRight: 'clamp' 
				});
				const fadeIn = interpolate(frame, [endFrame, endFrame + 5], [0, 1], { 
					extrapolateLeft: 'clamp', 
					extrapolateRight: 'clamp' 
                });
				
				volume = Math.min(volume, Math.min(fadeOut, fadeIn));
			}
		}
	}
	return Math.max(0, volume);
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
				<h1 style={{ color: 'white', fontFamily: 'sans-serif', fontSize: '40px' }}>⚠️ ОШИБКА РЕНДЕРА: Отсутствует ссылка на видео</h1>
			</AbsoluteFill>
		);
	}

	const currentVolume = getCurrentVolume(frame, fps, actions);

	return (
		<AbsoluteFill style={{ backgroundColor: 'black' }}>
			
			{/* === 1. ОСНОВНОЕ ВИДЕО === */}
			<AbsoluteFill>
				<Video 
					src={originalVideoUrl} 
					muted={true} 
					startFrom={0} 
					playbackRate={1}
					style={{ width: '100%', height: '100%', objectFit: 'contain' }}
					crossOrigin="anonymous" 
				/>
			</AbsoluteFill>

			{/* === 2. ОРИГИНАЛЬНЫЙ ЗВУК С ПЛАВНЫМ ПРИГЛУШЕНИЕМ === */}
			<Audio src={originalVideoUrl} volume={currentVolume} />

			{/* === 3. НАЛОЖЕНИЯ И АУДИОДОРОЖКИ === */}
			{actions?.map((action, index) => {
				const startFrame = Math.round(action.start_time * fps);
				const durationInFrames = Math.max(1, Math.round((action.end_time - action.start_time) * fps));

				// Генерируем уникальный ключ для предотвращения наложений и зависания картинок в кэше React
				const uniqueKey = `${action.type}-${action.url?.split('/').pop() || ''}-${startFrame}-${index}`;

				if ((action.type === 'overlay_image' || action.type === 'overlay_gif') && action.url) {
					const isVideoAsset = action.url.toLowerCase().endsWith('.mp4') || action.url.toLowerCase().endsWith('.webm');
					
					return (
						<Sequence key={uniqueKey} from={startFrame} durationInFrames={durationInFrames}>
							<AbsoluteFill style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', pointerEvents: 'none' }}>
								{isVideoAsset ? (
									<Loop durationInFrames={durationInFrames}>
										{/* Обертка для центрирования видео-реакций внутри Loop */}
										<AbsoluteFill style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', pointerEvents: 'none' }}>
											<Video 
												src={action.url} 
												style={{ 
													height: '70%',      // Фиксированная высота для предсказуемого масштаба
													width: 'auto',       // Авто-ширина сохраняет пропорции любых видео
													maxWidth: '90%',     // Защита от горизонтального выхода за рамки
													objectFit: 'contain',
													borderRadius: '20px',
													boxShadow: '0 20px 40px rgba(0,0,0,0.6)' 
												}}
												crossOrigin="anonymous"
											/>
										</AbsoluteFill>
									</Loop>
								) : (
									<Img 
										src={action.url} 
										style={{ 
											height: '70%',          // Фиксированная высота для идеальной консистенции
											width: 'auto',          // Авто-ширина сохраняет пропорции любых фото
											maxWidth: '90%',        // Защита от горизонтального выхода за рамки
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
						<Sequence key={uniqueKey} from={startFrame} durationInFrames={durationInFrames}>
							<Audio src={action.url} volume={1} />
						</Sequence>
					);
				}

				return null;
			})}
		</AbsoluteFill>
	);
};
