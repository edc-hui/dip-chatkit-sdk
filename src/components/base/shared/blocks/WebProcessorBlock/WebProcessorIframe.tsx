import React, { useEffect, useMemo, useState } from 'react';
import type { WebProcessorDataSchema } from '../../../../../types';
import { buildEmbedUrl, getWebProcessorHeight, getWebProcessorTitle } from './utils';

export interface WebProcessorIframeProps {
  data: WebProcessorDataSchema;
  mode?: 'chat' | 'modal';
}

const WebProcessorIframe: React.FC<WebProcessorIframeProps> = ({
  data,
  mode = 'chat',
}) => {
  const [loadError, setLoadError] = useState(false);
  const embedUrl = useMemo(() => buildEmbedUrl(data.url), [data.url]);
  const height = useMemo(() => getWebProcessorHeight(data, mode), [data, mode]);

  useEffect(() => {
    setLoadError(false);
  }, [embedUrl]);

  if (!embedUrl) {
    return (
      <div className="flex h-full min-h-[240px] items-center justify-center bg-gray-50 px-4 text-sm text-gray-500">
        无法加载页面，请使用浏览器打开。
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex h-full min-h-[240px] items-center justify-center bg-gray-50 px-4 text-sm text-gray-500">
        页面无法展示，请使用浏览器打开。
      </div>
    );
  }

  return (
    <div className="w-full" style={{ height }}>
      <iframe
        src={embedUrl}
        title={getWebProcessorTitle(data)}
        className="h-full w-full border-0 bg-white"
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
        onError={() => setLoadError(true)}
      />
    </div>
  );
};

export default WebProcessorIframe;
