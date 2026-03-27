//
//  PointerEventPath.swift
//  finalrun-ios-test
//
//  Created by Ajay S on 23/02/24.
//

import Foundation

struct KeyModifierFlags: OptionSet {
    let rawValue: UInt64
    static let capsLock = KeyModifierFlags(rawValue: 1 << 0)
    static let shift = KeyModifierFlags(rawValue: 1 << 1)
    static let control = KeyModifierFlags(rawValue: 1 << 2)
    static let option = KeyModifierFlags(rawValue: 1 << 3)
    static let command = KeyModifierFlags(rawValue: 1 << 4)
    static let function = KeyModifierFlags(rawValue: 1 << 5)
}

struct PointerEventPath {

    static func pathForTouch(at point: CGPoint, offset: TimeInterval = 0) -> Self {
        let alloced = objc_lookUpClass("XCPointerEventPath")!.alloc() as! NSObject
        let selector = NSSelectorFromString("initForTouchAtPoint:offset:")
        let imp = alloced.method(for: selector)
        typealias Method = @convention(c) (NSObject, Selector, CGPoint, TimeInterval) -> NSObject
        let method = unsafeBitCast(imp, to: Method.self)
        let path = method(alloced, selector, point, offset)
        return Self(path: path, offset: offset)
    }

    static func pathForTextInput(offset: TimeInterval = 0) -> Self {
        let alloced = objc_lookUpClass("XCPointerEventPath")!.alloc() as! NSObject
        let selector = NSSelectorFromString("initForTextInput")
        let imp = alloced.method(for: selector)
        typealias Method = @convention(c) (NSObject, Selector) -> NSObject
        let method = unsafeBitCast(imp, to: Method.self)
        let path = method(alloced, selector)
        return Self(path: path, offset: offset)
    }

    let path: NSObject
    var offset: TimeInterval

    private init(path: NSObject, offset: TimeInterval) {
        self.path = path
        self.offset = offset
    }

    mutating func liftUp() {
        let selector = NSSelectorFromString("liftUpAtOffset:")
        let imp = path.method(for: selector)
        typealias Method = @convention(c) (NSObject, Selector, TimeInterval) -> ()
        let method = unsafeBitCast(imp, to: Method.self)
        method(path, selector, offset)
    }

    mutating func moveTo(point: CGPoint) {
        let selector = NSSelectorFromString("moveToPoint:atOffset:")
        let imp = path.method(for: selector)
        typealias Method = @convention(c) (NSObject, Selector, CGPoint, TimeInterval) -> ()
        let method = unsafeBitCast(imp, to: Method.self)
        method(path, selector, point, offset)
    }

    mutating func type(text: String, typingSpeed: Int, shouldRedact: Bool = false) {
        let selector = NSSelectorFromString("typeText:atOffset:typingSpeed:shouldRedact:")
        let imp = path.method(for: selector)
        typealias Method = @convention(c) (NSObject, Selector, NSString, TimeInterval, UInt64, Bool) -> ()
        let method = unsafeBitCast(imp, to: Method.self)
        method(path, selector, text as NSString, offset, UInt64(typingSpeed), shouldRedact)
    }

    mutating func set(modifiers: KeyModifierFlags = []) {
        let selector = NSSelectorFromString("setModifiers:mergeWithCurrentModifierFlags:atOffset:")
        let imp = path.method(for: selector)
        typealias Method = @convention(c) (NSObject, Selector, UInt64, Bool, TimeInterval) -> ()
        let method = unsafeBitCast(imp, to: Method.self)
        method(path, selector, modifiers.rawValue, false, offset)
    }
    
    mutating func typeKey(_ key: String) {
        // Use the typeKey:modifiers:atOffset: method from XCPointerEventPath
        let selector = NSSelectorFromString("typeKey:modifiers:atOffset:")
        let imp = path.method(for: selector)
        typealias Method = @convention(c) (NSObject, Selector, NSString, UInt64, TimeInterval) -> ()
        let method = unsafeBitCast(imp, to: Method.self)
        method(path, selector, key as NSString, 0, offset)
    }
}
