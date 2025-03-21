/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* rendering object for CSS display:inline objects */

#ifndef nsInlineFrame_h___
#define nsInlineFrame_h___

#include "mozilla/Attributes.h"
#include "nsContainerFrame.h"

class nsLineLayout;

namespace mozilla {
class PresShell;
}  // namespace mozilla

/**
 * Inline frame class.
 *
 * This class manages a list of child frames that are inline frames. Working
 * with nsLineLayout, the class will reflow and place inline frames on a line.
 */
class nsInlineFrame : public nsContainerFrame {
 public:
  NS_DECL_QUERYFRAME
  NS_DECL_FRAMEARENA_HELPERS(nsInlineFrame)

  friend nsInlineFrame* NS_NewInlineFrame(mozilla::PresShell* aPresShell,
                                          ComputedStyle* aStyle);

  void BuildDisplayList(nsDisplayListBuilder* aBuilder,
                        const nsDisplayListSet& aLists) override;

#ifdef ACCESSIBILITY
  mozilla::a11y::AccType AccessibleType() override;
#endif

#ifdef DEBUG_FRAME_DUMP
  nsresult GetFrameName(nsAString& aResult) const override;
#endif

  void InvalidateFrame(uint32_t aDisplayItemKey = 0,
                       bool aRebuildDisplayItems = true) override;
  void InvalidateFrameWithRect(const nsRect& aRect,
                               uint32_t aDisplayItemKey = 0,
                               bool aRebuildDisplayItems = true) override;

  bool IsEmpty() override;
  bool IsSelfEmpty() override;

  nscoord GetCaretBaseline() const override;

  FrameSearchResult PeekOffsetCharacter(
      bool aForward, int32_t* aOffset,
      PeekOffsetCharacterOptions aOptions =
          PeekOffsetCharacterOptions()) override;

  void Destroy(DestroyContext&) override;

  void StealFrame(nsIFrame* aChild) override;

  void AddInlineMinISize(const mozilla::IntrinsicSizeInput& aInput,
                         InlineMinISizeData* aData) override;
  void AddInlinePrefISize(const mozilla::IntrinsicSizeInput& aInput,
                          InlinePrefISizeData* aData) override;
  SizeComputationResult ComputeSize(
      gfxContext* aRenderingContext, mozilla::WritingMode aWM,
      const mozilla::LogicalSize& aCBSize, nscoord aAvailableISize,
      const mozilla::LogicalSize& aMargin,
      const mozilla::LogicalSize& aBorderPadding,
      const mozilla::StyleSizeOverrides& aSizeOverrides,
      mozilla::ComputeSizeFlags aFlags) override;
  nsRect ComputeTightBounds(DrawTarget* aDrawTarget) const override;

  void Reflow(nsPresContext* aPresContext, ReflowOutput& aReflowOutput,
              const ReflowInput& aReflowInput,
              nsReflowStatus& aStatus) override;

  nsresult AttributeChanged(int32_t aNameSpaceID, nsAtom* aAttribute,
                            int32_t aModType) override;

  bool CanContinueTextRun() const override;

  void PullOverflowsFromPrevInFlow() override;

  Maybe<nscoord> GetNaturalBaselineBOffset(
      mozilla::WritingMode aWM, BaselineSharingGroup aBaselineGroup,
      BaselineExportContext) const override;
  bool DrainSelfOverflowList() override;

  /**
   * Return true if the frame is first visual frame or first continuation
   */
  bool IsFirst() const {
    // If the frame's bidi visual state is set, return is-first state
    // else return true if it's the first continuation.
    return HasAnyStateBits(NS_INLINE_FRAME_BIDI_VISUAL_STATE_IS_SET)
               ? HasAnyStateBits(NS_INLINE_FRAME_BIDI_VISUAL_IS_FIRST)
               : !GetPrevInFlow();
  }

  /**
   * Return true if the frame is last visual frame or last continuation.
   */
  bool IsLast() const {
    // If the frame's bidi visual state is set, return is-last state
    // else return true if it's the last continuation.
    return HasAnyStateBits(NS_INLINE_FRAME_BIDI_VISUAL_STATE_IS_SET)
               ? HasAnyStateBits(NS_INLINE_FRAME_BIDI_VISUAL_IS_LAST)
               : !GetNextInFlow();
  }

  // Restyles the block wrappers around our non-inline-outside kids.
  // This will only be called when such wrappers in fact exist.
  void UpdateStyleOfOwnedAnonBoxesForIBSplit(
      mozilla::ServoRestyleState& aRestyleState);

 protected:
  // Additional reflow input used during our reflow methods
  struct InlineReflowInput {
    nsIFrame* mPrevFrame;
    nsInlineFrame* mNextInFlow;
    nsIFrame* mLineContainer;
    nsLineLayout* mLineLayout;
    bool mSetParentPointer;  // when reflowing child frame first set its
                             // parent frame pointer

    InlineReflowInput() {
      mPrevFrame = nullptr;
      mNextInFlow = nullptr;
      mLineContainer = nullptr;
      mLineLayout = nullptr;
      mSetParentPointer = false;
    }
  };

  nsInlineFrame(ComputedStyle* aStyle, nsPresContext* aPresContext, ClassID aID)
      : nsContainerFrame(aStyle, aPresContext, aID),
        mBaseline(NS_INTRINSIC_ISIZE_UNKNOWN) {}

  LogicalSides GetLogicalSkipSides() const override;

  void ReflowFrames(nsPresContext* aPresContext,
                    const ReflowInput& aReflowInput, InlineReflowInput& rs,
                    ReflowOutput& aMetrics, nsReflowStatus& aStatus);

  void ReflowInlineFrame(nsPresContext* aPresContext,
                         const ReflowInput& aReflowInput, InlineReflowInput& rs,
                         nsIFrame* aFrame, nsReflowStatus& aStatus);

  // Returns whether there's any frame that PullOneFrame would pull from
  // aNextInFlow or any of aNextInFlow's next-in-flows.
  static bool HasFramesToPull(nsInlineFrame* aNextInFlow);

  virtual nsIFrame* PullOneFrame(nsPresContext*, InlineReflowInput&);

  virtual void PushFrames(nsPresContext* aPresContext, nsIFrame* aFromChild,
                          nsIFrame* aPrevSibling, InlineReflowInput& aState);

 private:
  explicit nsInlineFrame(ComputedStyle* aStyle, nsPresContext* aPresContext)
      : nsInlineFrame(aStyle, aPresContext, kClassID) {}

  /**
   * Move any frames on our overflow list to the end of our principal list.
   * @param aInFirstLine whether we're in a first-line frame.
   * @return true if there were any overflow frames
   */
  bool DrainSelfOverflowListInternal(bool aInFirstLine);

 protected:
  nscoord mBaseline;
};

//----------------------------------------------------------------------

/**
 * Variation on inline-frame used to manage lines for line layout in
 * special situations (:first-line style in particular).
 */
class nsFirstLineFrame final : public nsInlineFrame {
 public:
  NS_DECL_FRAMEARENA_HELPERS(nsFirstLineFrame)

  friend nsFirstLineFrame* NS_NewFirstLineFrame(mozilla::PresShell* aPresShell,
                                                ComputedStyle* aStyle);

#ifdef DEBUG_FRAME_DUMP
  nsresult GetFrameName(nsAString& aResult) const override;
#endif

  void Reflow(nsPresContext* aPresContext, ReflowOutput& aReflowOutput,
              const ReflowInput& aReflowInput,
              nsReflowStatus& aStatus) override;

  void Init(nsIContent* aContent, nsContainerFrame* aParent,
            nsIFrame* aPrevInFlow) override;
  void PullOverflowsFromPrevInFlow() override;
  bool DrainSelfOverflowList() override;

 protected:
  explicit nsFirstLineFrame(ComputedStyle* aStyle, nsPresContext* aPresContext)
      : nsInlineFrame(aStyle, aPresContext, kClassID) {}

  nsIFrame* PullOneFrame(nsPresContext*, InlineReflowInput&) override;
};

#endif /* nsInlineFrame_h___ */
