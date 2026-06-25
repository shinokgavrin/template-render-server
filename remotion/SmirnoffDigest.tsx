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
	
	// Calculate the current time in seconds to handle background audio ducking
	const currentTime = frame / fps;
	
	// Check if the current time falls inside any "mute" or "mute_title" block
	const isMuted = actions.some(
		(a) => (a.type === 'mute_title' || a.type === 'mute') && 
		currentTime >= a.start_time && 
		currentTime <= a.end_time
	);
	
	// If a TTS track is playing, drop the background video volume to 10% (ducking)
	const backgroundVolume = isMuted ? 0.1 : 1;

	return (
		<AbsoluteFill style={{ backgroundColor: 'black' }}>
			
			{/* 1. THE MAIN BACKGROUND VIDEO */}
			<AbsoluteFill>
				<Video src={originalVideoUrl} volume={backgroundVolume} />
			</AbsoluteFill>

			{/* 2. THE OVERLAYS AND AUDIO TRACKS */}
			{actions.map((action, index) => {
				const startFrame = Math.round(action.start_time * fps);
				const durationInFrames = Math.max(1, Math.round((action.end_time - action.start_time) * fps));

				// Render Image/GIF Overlays
				if ((action.type === 'overlay_image' || action.type === 'overlay_gif') && action.url) {
					return (
						<Sequence key={index} from={startFrame} durationInFrames={durationInFrames}>
							<AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
								<Img 
									src={action.url} 
									style={{ 
										maxWidth: action.max_width ? `${action.max_width}px` : '1080px',
										maxHeight: '1350px',
										objectFit: 'contain',
										borderRadius: '20px', // Nice rounded corners for a premium feel
										boxShadow: '0 20px 40px rgba(0,0,0,0.5)' 
									}} 
								/>
							</AbsoluteFill>
						</Sequence>
					);
				}

				// Render TTS Audio Tracks
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
