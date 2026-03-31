package app.finalrun.android.action

import app.finalrun.android.data.hierarchy.AccNode

data class NodeMatchResult(
    var matchingNodes: List<AccNode>? = null,
    val matchingNode: AccNode? = null,
    val matchedProps: List<String> = mutableListOf(),
    val unmatchedProps: List<String> = mutableListOf()
)