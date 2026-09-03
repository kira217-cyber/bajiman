import React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useSelector } from "react-redux";
import { useLanguage } from "../../Context/LanguageProvider";
import { selectModalColorSetting } from "../../features/global/globalSelectors";

const defaultModalColors = {
  modalBg: "#ffffff",
  pageOverlayBg: "rgba(0,0,0,0.45)",

  headerBg: "#0865a9",
  headerText: "#ffffff",
  primaryBg: "#0865a9",
  normalText: "#333333",
  mutedText: "#777777",
  cardBorder: "#dce8f5",
};

// Light markup convention so admin can reproduce a "Weekly Lucky Draw"
// style layout (paragraph, bold sub-headers, bullet lists) from one plain
// text field: a line ending with ":" is a bold sub-header, a line
// starting with "- " is a bullet point, a blank line adds spacing,
// anything else is a plain paragraph.
const renderBody = (text, colors) => {
  if (!text) return null;

  const lines = String(text).split(/\r?\n/);
  const blocks = [];
  let currentList = null;

  lines.forEach((rawLine) => {
    const line = rawLine.trim();

    if (!line) {
      currentList = null;
      blocks.push({ type: "spacer" });
      return;
    }

    if (line.startsWith("- ")) {
      if (!currentList) {
        currentList = { type: "list", items: [] };
        blocks.push(currentList);
      }
      currentList.items.push(line.slice(2).trim());
      return;
    }

    currentList = null;

    if (line.endsWith(":")) {
      blocks.push({ type: "header", text: line });
      return;
    }

    blocks.push({ type: "paragraph", text: line });
  });

  return blocks.map((block, index) => {
    if (block.type === "spacer") {
      return <div key={index} className="h-2" />;
    }

    if (block.type === "header") {
      return (
        <p
          key={index}
          className="mt-3 text-[13px] font-bold first:mt-0"
          style={{ color: colors.normalText }}
        >
          {block.text}
        </p>
      );
    }

    if (block.type === "list") {
      return (
        <ul key={index} className="mt-1 list-disc space-y-1 pl-5">
          {block.items.map((item, itemIndex) => (
            <li
              key={itemIndex}
              className="text-[13px] leading-6"
              style={{ color: colors.normalText }}
            >
              {item}
            </li>
          ))}
        </ul>
      );
    }

    return (
      <p
        key={index}
        className="text-[13px] leading-6"
        style={{ color: colors.normalText }}
      >
        {block.text}
      </p>
    );
  });
};

// Single-banner popup for a slider in "promo" mode — image, blue title
// bar, rich body text and an optional details table (e.g. a weekly draw's
// Frequency/Prizes table). Deliberately smaller than PromotionModal (no
// list/search), since a slide only ever shows its own one promo.
const SliderPromoModal = ({ open, onClose, image, title, description, table }) => {
  const { isBangla } = useLanguage();

  const modalColorSetting = useSelector(selectModalColorSetting);
  const colors = {
    ...defaultModalColors,
    ...(modalColorSetting || {}),
  };

  const tableRows = Array.isArray(table?.rows) ? table.rows : [];
  const showTable = Boolean(table?.enabled) && tableRows.length > 0;

  const col1Label = isBangla ? table?.col1Label?.bn : table?.col1Label?.en;
  const col2Label = isBangla ? table?.col2Label?.bn : table?.col2Label?.en;

  return (
    <AnimatePresence>
      {open && (
        <div
          className="fixed inset-0 z-[100000] flex items-center justify-center px-4"
          style={{ background: colors.pageOverlayBg }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 16 }}
            transition={{ duration: 0.2 }}
            className="relative flex max-h-[88vh] w-full max-w-[600px] flex-col overflow-hidden rounded-[10px] shadow-2xl"
            style={{ backgroundColor: colors.modalBg }}
          >
            <button
              type="button"
              onClick={onClose}
              aria-label={isBangla ? "বন্ধ করুন" : "Close"}
              className="absolute right-3 top-3 z-10 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-black/40 text-white transition hover:bg-black/60"
            >
              <X size={18} />
            </button>

            {image ? (
              <img
                src={image}
                alt={title}
                className="max-h-[360px] w-full object-contain"
                style={{ backgroundColor: colors.headerBg }}
              />
            ) : null}

            <div
              className="px-4 py-3 text-[16px] font-bold"
              style={{
                backgroundColor: colors.headerBg,
                color: colors.headerText,
              }}
            >
              {title}
            </div>

            {description || showTable ? (
              <div className="flex-1 overflow-y-auto px-4 py-4">
                {renderBody(description, colors)}

                {showTable && (
                  <div
                    className="mt-4 overflow-hidden rounded-[6px] border"
                    style={{ borderColor: colors.cardBorder }}
                  >
                    <table className="w-full border-collapse text-left">
                      <thead>
                        <tr>
                          <th
                            className="px-3 py-2 text-[13px] font-bold"
                            style={{
                              backgroundColor: colors.headerBg,
                              color: colors.headerText,
                            }}
                          >
                            {col1Label}
                          </th>
                          <th
                            className="px-3 py-2 text-[13px] font-bold"
                            style={{
                              backgroundColor: colors.headerBg,
                              color: colors.headerText,
                            }}
                          >
                            {col2Label}
                          </th>
                        </tr>
                      </thead>

                      <tbody>
                        {tableRows.map((row, index) => (
                          <tr
                            key={index}
                            className="border-t"
                            style={{ borderColor: colors.cardBorder }}
                          >
                            <td
                              className="px-3 py-2 text-[13px]"
                              style={{ color: colors.normalText }}
                            >
                              {isBangla ? row?.col1?.bn : row?.col1?.en}
                            </td>
                            <td
                              className="px-3 py-2 text-[13px]"
                              style={{ color: colors.normalText }}
                            >
                              {isBangla ? row?.col2?.bn : row?.col2?.en}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : null}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default SliderPromoModal;
