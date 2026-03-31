//
//  XCViewHierarchyPayload.swift
//  finalrun-ios-test
//
//  Created by Ajay S on 02/02/24.
//

import Foundation
import XCTest
import UIKit

struct XCViewHierarchyPayload: Codable {
    var type: String?
    var requestId: String?
    var success: Bool?
    var data: XCViewHierarchyResponse?
}

extension XCViewHierarchyPayload: Equatable {
    static func == (lhs: XCViewHierarchyPayload, rhs: XCViewHierarchyPayload) -> Bool {
        return  lhs.type == rhs.type && lhs.data == rhs.data
    }
}

struct XCViewHierarchyResponse: Codable {
    var hierarchy: String?
    var screenshot: String?
    var screenWidth: Int?
    var screenHeight: Int?
    var isKeyboardShown: Bool? = false
    var deviceTime: String? = nil
    var timezone: String? = nil
}

extension XCViewHierarchyResponse: Equatable {
    static func == (lhs: XCViewHierarchyResponse, rhs: XCViewHierarchyResponse) -> Bool {
        return  lhs.hierarchy == rhs.hierarchy
    }
}
