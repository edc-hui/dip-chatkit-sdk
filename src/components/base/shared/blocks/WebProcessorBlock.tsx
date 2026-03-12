import React, { useCallback, useMemo, useState } from 'react';
import type { WebProcessorBlock as WebProcessorBlockType } from '../../../../types';
import { KnowledgeSourceIcon } from '../../../icons';
import WebProcessorContentView from './WebProcessorBlock/WebProcessorContentView';
import WebProcessorModal from './WebProcessorBlock/WebProcessorModal';
import { getSafeWebProcessorUrl, getWebProcessorDisplayUrl, getWebProcessorTitle } from './WebProcessorBlock/utils';

export interface WebProcessorBlockProps {
  block: WebProcessorBlockType;
}

const WebProcessorBlock: React.FC<WebProcessorBlockProps> = ({ block }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const data = block.content;
  const safeUrl = useMemo(() => getSafeWebProcessorUrl(data.url), [data.url]);
  const displayUrl = useMemo(() => getWebProcessorDisplayUrl(data.url), [data.url]);

  const handleOpenNewWindow = useCallback(() => {
    if (!safeUrl) return;
    window.open(safeUrl.toString(), '_blank', 'noopener,noreferrer');
  }, [safeUrl]);

  return (
    <>
      <div className="rounded-[6px] border border-[#d9d9d9] bg-white">
        <div className="flex items-center justify-between gap-3 px-3 py-2">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center">
              <KnowledgeSourceIcon className="h-5 w-5" />
            </div>
            <div className="flex min-w-0 items-center gap-2">
              <span className="truncate text-sm text-[rgba(0,0,0,0.65)]">
                {getWebProcessorTitle(data)}
              </span>
              {safeUrl && (
                <a
                  href={safeUrl.toString()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="truncate rounded px-2 py-0.5 text-xs text-[#126EE3] transition-colors hover:bg-[rgba(18,110,227,0.08)]"
                  title={safeUrl.toString()}
                >
                  {displayUrl}
                </a>
              )}
            </div>
          </div>
          {block.consumeTime !== undefined && (
            <div className="flex-shrink-0 text-sm text-[rgba(0,0,0,0.45)]">
              耗时：{Number(block.consumeTime / 1000).toFixed(2)}s
            </div>
          )}
        </div>
      </div>

      <div className="mt-2">
        <WebProcessorContentView
          data={data}
          onZoom={() => setIsModalOpen(true)}
          onOpenNewWindow={handleOpenNewWindow}
        />
      </div>

      <WebProcessorModal
        open={isModalOpen}
        data={data}
        onClose={() => setIsModalOpen(false)}
        onOpenNewWindow={handleOpenNewWindow}
      />
    </>
  );
};

export default WebProcessorBlock;
