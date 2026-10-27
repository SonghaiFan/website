<script setup>
// The F signature beside the pull hints, written by the pull. It is one open
// stroke (from f-icon-curve.svg), so drawing it along its length reads as writing
// the signature: nothing at rest beyond a faint ghost, the whole signature exactly
// at the threshold. A spring-back unwrites it the same way.
defineProps({
  progress: { type: Number, default: 0 }, // 0..1, where 1 is the threshold
  ready: { type: Boolean, default: false },
});

// Source: f-icon-curve.svg (viewBox 0 0 780 637); its two nested translates are
// folded into the one below.
const D = "M7095.445,2974.639C7095.445,2974.639 7280.491,2808.227 7724.501,2723.924C7724.501,2723.924 7256.796,2881.525 6977.849,3299.458C6977.849,3299.458 7301.037,3097.034 7670.305,3041.039C7670.305,3041.039 7479.889,3117.172 7303.455,3327.147C7303.455,3327.147 7314.564,3227.423 7454.061,3031.798";
const SHIFT = "translate(-6961.182286 -2707.257511)";
</script>

<template>
  <svg class="pull-mark" :class="{ 'is-ready': ready }" viewBox="0 0 780 637" aria-hidden="true">
    <g :transform="SHIFT">
      <path class="pull-mark-ghost" :d="D" />
      <path
        class="pull-mark-ink"
        :d="D"
        pathLength="1"
        :style="{ strokeDashoffset: (1 - Math.min(1, Math.max(0, progress))).toFixed(4) }"
      />
    </g>
  </svg>
</template>

<style scoped>
.pull-mark {
  display: inline-block;
  flex: none;
  width: 17px;
  height: 14px;
  overflow: visible;
  vertical-align: -2px;
}
/* 44 units ≈ 1px at this size (the viewBox is ~46× the drawn width). */
.pull-mark path {
  fill: none;
  stroke-width: 44;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.pull-mark-ghost { stroke: currentColor; opacity: .3; }
.pull-mark-ink {
  stroke: var(--vp-c-text-1);
  stroke-dasharray: 1 1;
}
</style>
