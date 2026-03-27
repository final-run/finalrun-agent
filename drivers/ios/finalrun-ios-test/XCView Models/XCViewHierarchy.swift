//
//  XCViewHierarchy.swift
//  finalrun-ios-test
//
//  Created by Ajay S on 02/02/24.
//

import Foundation
import UIKit
import XCTest

enum ElementType: Int, Codable {
    case UISwitch = 40
}

typealias XCFrame = [String: Double]
extension XCFrame {
    static var zero: Self {
        ["X": 0, "Y": 0, "Width": 0, "Height": 0]
    }
}

struct XCBounds: Codable {
    var left: Double?
    var top: Double?
    var right: Double?
    var bottom: Double?
}

extension XCBounds: Equatable {
    static func == (lhs: XCBounds, rhs: XCBounds) -> Bool {
        return lhs.left == rhs.left && lhs.top == rhs.top && lhs.right == rhs.right && lhs.bottom == rhs.bottom
    }
}

struct XCViewHierarchy: Codable {
    var identifier: String?
    var label: String?
    var title: String?
    var elementType: Int?
    var value: String?
    var placeholderValue: String?
    var is_selected: Bool?
    var is_enabled: Bool?
    var bounds: XCBounds?
    var uuid: String?
    var parent_uuid: String?
    var children: [String]?
    var is_focused: Bool?
    
    init(_ dict: [XCUIElement.AttributeName: Any], uuid: String?, parentUUID: String?, children: [String]?) {
        func valueFor(_ name: String) -> Any {
            dict[XCUIElement.AttributeName(rawValue: name)] as Any
        }
        self.uuid = uuid
        self.parent_uuid = parentUUID
        self.children = children
        self.elementType = valueFor("elementType") as? Int
        self.is_selected = valueFor("selected") as? Bool
        self.is_enabled = valueFor("enabled") as? Bool
        self.label = valueFor("label") as? String
        self.identifier = valueFor("identifier") as? String
        self.placeholderValue = valueFor("placeholderValue") as? String
        self.value = valueFor("value") as? String
        self.title = valueFor("title") as? String
        self.is_focused = valueFor("hasFocus") as? Bool
        let frame = valueFor("frame") as? XCFrame ?? .zero
        let left = frame["X"]!
        let top = frame["Y"]!
        let right = left + (frame["Width"] ?? 0.0)
        let bottom = top + (frame["Height"] ?? 0.0)
        self.bounds = XCBounds(left: left, top: top, right: right, bottom: bottom)
    }
    
//    func isNodeMatching(nodeAttr: NodeAttr) -> Bool {
//        let identifier = nodeAttr.identifier
//        let label = nodeAttr.label
//        let title = nodeAttr.title
//        let elementType = nodeAttr.elementType
//                        
//        var numberOfIdentifiers = 0
//        var numberOfIdentifiersMatched = 0
//        
//        if let identifier = identifier {
//            numberOfIdentifiers += 1
//            if let nodeIdentifier = self.identifier, identifier == nodeIdentifier {
//                numberOfIdentifiersMatched += 1
//            }
//        }
//        if let label = label {
//            numberOfIdentifiers += 1
//            if let nodeLabel = self.label, label == nodeLabel {
//                numberOfIdentifiersMatched += 1
//            }
//        }
//        if let title = title {
//            numberOfIdentifiers += 1
//            if let nodeTitle = self.title, title == nodeTitle {
//                numberOfIdentifiersMatched += 1
//            }
//        }
//        if let elementType = elementType {
//            numberOfIdentifiers += 1
//            if let nodeElementType = self.elementType, elementType == nodeElementType {
//                numberOfIdentifiersMatched += 1
//            }
//        }
//        if numberOfIdentifiers > 0 && numberOfIdentifiersMatched == numberOfIdentifiers {
//            return true
//        }
//        return false
//    }
}

extension XCViewHierarchy: Equatable {
    static func == (lhs: XCViewHierarchy, rhs: XCViewHierarchy) -> Bool {
        return  lhs.elementType == rhs.elementType && lhs.identifier == rhs.identifier && lhs.value == rhs.value && lhs.title == rhs.title && lhs.label == rhs.label && lhs.placeholderValue == rhs.placeholderValue && lhs.is_selected == rhs.is_selected && lhs.is_enabled == rhs.is_enabled && lhs.bounds == rhs.bounds && lhs.is_focused == rhs.is_focused
    }
}
