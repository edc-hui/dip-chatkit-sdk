import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { WebProcessorDataSchema } from '../../../../../types';
import { CloseIcon, NewIcon } from '../../../../icons';
import { resolveDrawerPortalContainer, useDrawerPortalContainer } from '../../../DrawerPortalContext';
import WebProcessorIframe from './WebProcessorIframe';
import { getWebProcessorTitle } from './utils';

export interface WebProcessorModalProps {
  open: boolean;
  data: WebProcessorDataSchema;
  onClose: () => void;
  onOpenNewWindow: () => void;
}

const WebProcessorModal: React.FC<WebProcessorModalProps> = ({
  open,
  data,
  onClose,
  onOpenNewWindow,
}) => {
  const container = useDrawerPortalContainer();

  useEffect(() => {
    if (!open) return;

    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [open, onClose]);

  if (!open) return null;

  const portalContainer = resolveDrawerPortalContainer(undefined, container);

  const modalContent = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"
      onClick={onClose}
      aria-modal="true"
      aria-labelledby="webprocessor-modal-title"
    >
      <div
        className="relative flex h-[90vh] max-h-[800px] w-[90vw] max-w-[1200px] flex-col rounded-lg bg-white p-5 shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
          aria-label="关闭"
        >
          <CloseIcon className="h-5 w-5" />
        </button>

        <div className="mb-4 flex items-center justify-between border-b border-gray-200 pb-3 pr-10">
          <div id="webprocessor-modal-title" className="text-lg font-medium text-gray-900">
            {getWebProcessorTitle(data)}
          </div>
          <button
            type="button"
            className="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm text-[rgba(0,0,0,0.65)] transition-colors hover:bg-gray-100 hover:text-[rgba(0,0,0,0.85)]"
            onClick={onOpenNewWindow}
          >
            <NewIcon className="h-4 w-4" />
            <span>新窗口查看</span>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-[#E5E7EB] bg-white">
          <WebProcessorIframe data={data} mode="modal" />
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, portalContainer);
};

export default WebProcessorModal;
