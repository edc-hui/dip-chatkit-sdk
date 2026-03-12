import React from 'react';
import type { WebProcessorDataSchema } from '../../../../../types';
import { ExpandIcon, NewIcon } from '../../../../icons';
import WebProcessorIframe from './WebProcessorIframe';
import { getSafeWebProcessorUrl, getWebProcessorDisplayUrl, getWebProcessorTitle } from './utils';

export interface WebProcessorContentViewProps {
  data: WebProcessorDataSchema;
  onZoom: () => void;
  onOpenNewWindow: () => void;
}

const iconButtonClass = 'flex h-8 w-8 items-center justify-center rounded-md text-[rgba(0,0,0,0.65)] transition-colors hover:bg-gray-100 hover:text-[rgba(0,0,0,0.85)]';

const WebProcessorContentView: React.FC<WebProcessorContentViewProps> = ({
  data,
  onZoom,
  onOpenNewWindow,
}) => {
  const safeUrl = getSafeWebProcessorUrl(data.url);

  return (
    <div className="overflow-hidden rounded-[8px] border border-[#E5E7EB] bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-[#E5E7EB] px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-[rgba(0,0,0,0.85)]">
            {getWebProcessorTitle(data)}
          </div>
          {safeUrl && (
            <div className="truncate text-xs text-[rgba(0,0,0,0.45)]">
              {getWebProcessorDisplayUrl(data.url)}
            </div>
          )}
        </div>
        <div className="ml-4 flex items-center gap-2">
          <button
            type="button"
            className={iconButtonClass}
            onClick={onZoom}
            aria-label="放大"
            title="放大"
          >
            <ExpandIcon className="h-[14px] w-[14px]" />
          </button>
          <button
            type="button"
            className={iconButtonClass}
            onClick={onOpenNewWindow}
            aria-label="新窗口查看"
            title="新窗口查看"
          >
            <NewIcon className="h-4 w-4" />
          </button>
        </div>
      </div>
      <WebProcessorIframe data={data} mode="chat" />
    </div>
  );
};

export default WebProcessorContentView;
